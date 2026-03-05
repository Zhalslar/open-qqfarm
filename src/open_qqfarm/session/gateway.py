from __future__ import annotations

import asyncio
import errno
from typing import Any, TypeVar
from urllib.parse import urlencode

from aiohttp import (
    ClientConnectionError,
    ClientOSError,
    ClientResponseError,
    ClientSession,
    ClientWebSocketResponse,
    WSMsgType,
)

from ..config import CoreConfig
from ..models import RuntimeState
from ..services.log_service import logger
from .gate_codec import decode_event_message, decode_gate_message, encode_request
from .notify_dispatcher import NotifyDispatcher

TReply = TypeVar("TReply")


class GatewaySessionError(RuntimeError):
    pass


class GatewayAuthCodeInvalidError(GatewaySessionError):
    pass


class GatewayNetworkUnavailableError(GatewaySessionError):
    pass


class GatewaySession:
    def __init__(self, config: CoreConfig, runtime: RuntimeState):
        self.cfg = config
        self.runtime = runtime

        self._http: ClientSession | None = None
        self._ws: ClientWebSocketResponse | None = None
        self._recv_task: asyncio.Task | None = None

        self._client_seq = 1
        self._server_seq = 0
        self._pending: dict[int, asyncio.Future[bytes]] = {}
        self._send_lock = asyncio.Lock()
        self._connect_lock = asyncio.Lock()
        self._close_lock = asyncio.Lock()
        self._closed = True

        self.notify_dispatcher = NotifyDispatcher()


    def _build_ws_url(self, auth_code: str) -> str:
        args = {
            "platform": self.cfg.client.platform,
            "os": self.cfg.client.os,
            "ver": self.cfg.client.client_version,
            "code": auth_code,
            "openID": "",
        }
        return f"{self.cfg.gateway_ws_url}?{urlencode(args)}"

    @property
    def connected(self) -> bool:
        ws = self._ws
        return bool(ws is not None and not ws.closed)

    # 精准网络错误判断（删除字符串匹配）
    @staticmethod
    def _is_network_unavailable_error(error: Exception) -> bool:
        if isinstance(
            error,
            (ClientConnectionError, ClientOSError, asyncio.TimeoutError),
        ):
            return True

        if isinstance(error, OSError):
            return error.errno in {
                errno.ENETUNREACH,
                errno.EHOSTUNREACH,
                errno.ECONNREFUSED,
                errno.ETIMEDOUT,
            }

        return False

    async def start(self, auth_code: str) -> None:
        async with self._connect_lock:
            if self.connected:
                return
            if not auth_code:
                raise GatewaySessionError("缺少网关授权码")

            if self._ws is not None or self._http is not None or self._recv_task is not None:
                await self.stop()

            self._closed = False
            self._client_seq = 1
            self._server_seq = 0
            self._pending.clear()

            self._http = ClientSession(headers=self.cfg.headers)

            try:
                self._ws = await self._http.ws_connect(
                    url=self._build_ws_url(auth_code),
                    heartbeat=self.cfg.ws_heartbeat,
                    origin=self.cfg.origin,
                    autoclose=True,
                    autoping=True,
                )
            except Exception as e:
                await self.stop()
                self.runtime.connected = False

                # HTTP 400 → 授权码失效
                if isinstance(e, ClientResponseError) and e.status == 400:
                    self.runtime.auth_code_valid = False
                    raise GatewayAuthCodeInvalidError(
                        "网关授权码已失效, 网关鉴权失败(HTTP 400)"
                    ) from e

                # 网络不可达
                if self._is_network_unavailable_error(e):
                    self.runtime.network_available = False
                    raise GatewayNetworkUnavailableError(f"网关连接失败：{e}") from e

                raise GatewaySessionError(f"网关连接失败：{e}") from e

            # 连接成功 → 正确标定 runtime
            self.runtime.connected = True
            self.runtime.auth_code_valid = True
            self.runtime.network_available = True

            self._recv_task = asyncio.create_task(self._recv_loop())

    async def stop(self) -> None:
        async with self._close_lock:
            self.runtime.connected = False
            self._closed = True

            # 失败所有 pending
            pending = list(self._pending.values())
            self._pending.clear()
            for fut in pending:
                if not fut.done():
                    fut.set_exception(GatewaySessionError("网关连接已断开"))

            # 取消接收任务
            task = self._recv_task
            self._recv_task = None
            current = asyncio.current_task()
            if task and task is not current and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass

            # 关闭 websocket
            ws = self._ws
            self._ws = None
            if ws and not ws.closed:
                try:
                    await ws.close()
                except Exception:
                    pass

            # 关闭 http session
            http = self._http
            self._http = None
            if http and not http.closed:
                try:
                    await http.close()
                except Exception:
                    pass

            await self.notify_dispatcher.clear()

    async def reconnect(self, auth_code: str) -> None:
        await self.stop()
        await self.start(auth_code)

    async def _recv_loop(self) -> None:
        ws = self._ws
        if ws is None:
            return

        try:
            async for msg in ws:
                if msg.type == WSMsgType.BINARY:
                    try:
                        await self._handle_binary(bytes(msg.data))
                    except Exception as e:
                        logger.error(f"解码二进制消息失败：{e}")
                elif msg.type in {WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR}:
                    break

        except Exception as e:
            if self._is_network_unavailable_error(e):
                self.runtime.network_available = False
            self.runtime.connected = False
            logger.error(f"网关接收循环异常：{e}")

        finally:
            await self.stop()

    async def _handle_binary(self, data: bytes) -> None:
        parsed = decode_gate_message(data)

        if parsed.meta.server_seq > self._server_seq:
            self._server_seq = parsed.meta.server_seq

        if parsed.meta.message_type == 2:
            seq = parsed.meta.client_seq
            fut = self._pending.pop(seq, None)
            if fut is None or fut.done():
                return

            if parsed.meta.error_code != 0:
                fut.set_exception(
                    GatewaySessionError(
                        f"{parsed.meta.service_name}.{parsed.meta.method_name} "
                        f"error={parsed.meta.error_code} {parsed.meta.error_message}"
                    )
                )
                return

            fut.set_result(parsed.body)
            return

        if parsed.meta.message_type == 3:
            try:
                event_type, event_body = decode_event_message(parsed.body)
                await self.notify_dispatcher.emit(event_type, event_body)
            except Exception:
                return

    async def call(self, service: str, method: str, body: bytes) -> bytes:
        if not self.connected:
            self.runtime.connected = False
            raise GatewaySessionError("网关连接未建立")

        async with self._send_lock:
            seq = self._client_seq
            self._client_seq += 1

            payload = encode_request(
                service,
                method,
                body,
                client_seq=seq,
                server_seq=self._server_seq,
            )

            fut: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()
            self._pending[seq] = fut

            ws = self._ws
            if ws is None or ws.closed:
                self._pending.pop(seq, None)
                self.runtime.connected = False
                raise GatewaySessionError("网关连接已关闭")

            try:
                await ws.send_bytes(payload)
            except Exception as e:
                self._pending.pop(seq, None)

                if self._is_network_unavailable_error(e):
                    self.runtime.network_available = False
                    self.runtime.connected = False
                    raise GatewayNetworkUnavailableError(
                        f"发送请求失败：{service}.{method}: {e}"
                    ) from e

                self.runtime.connected = False
                raise GatewaySessionError(
                    f"发送请求失败：{service}.{method}: {e}"
                ) from e

        try:
            return await asyncio.wait_for(fut, timeout=self.cfg.rpc_timeout)
        except asyncio.TimeoutError as e:
            self._pending.pop(seq, None)
            if not self.connected:
                raise GatewayNetworkUnavailableError(
                    f"请求超时且连接已断开：{service}.{method}"
                ) from e

            raise GatewaySessionError(f"请求超时：{service}.{method}") from e

    async def _call_proto(
        self, service: str, method: str, request: Any, reply: TReply
    ) -> TReply:
        body = await self.call(service, method, request.SerializeToString())
        reply.ParseFromString(body)  # type: ignore
        return reply
