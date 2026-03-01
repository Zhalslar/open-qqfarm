from __future__ import annotations

import asyncio
from typing import Any, TypeVar
from urllib.parse import urlencode

from aiohttp import ClientSession, ClientWebSocketResponse, WSMsgType

from ..config import CoreConfig
from ..services.log_service import logger
from .gate_codec import decode_event_message, decode_gate_message, encode_request
from .notify_dispatcher import NotifyDispatcher

TReply = TypeVar("TReply")


class GatewaySessionError(RuntimeError):
    pass


class GatewayAuthCodeInvalidError(GatewaySessionError):
    pass


class GatewaySession:
    def __init__(self, config: CoreConfig):
        self.cfg = config

        self._http: ClientSession | None = None
        self._ws: ClientWebSocketResponse | None = None
        self._recv_task: asyncio.Task | None = None

        self._client_seq = 1
        self._server_seq = 0
        self._pending: dict[int, asyncio.Future[bytes]] = {}
        self._send_lock = asyncio.Lock()
        self._close_lock = asyncio.Lock()
        self._closed = True

        self.notify_dispatcher = NotifyDispatcher()

        self.gateway_ws_url = "wss://gate-obt.nqf.qq.com/prod/ws"
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 "
                "MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI "
                "MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)"
            )
        }
        self.origin = "https://gate-obt.nqf.qq.com"

    def _build_ws_url(self, auth_code: str) -> str:
        args = {
            "platform": self.cfg.client.platform,
            "os": self.cfg.client.os,
            "ver": self.cfg.client.client_version,
            "code": auth_code,
            "openID": "",
        }
        return f"{self.gateway_ws_url}?{urlencode(args)}"

    @property
    def connected(self) -> bool:
        ws = self._ws
        return bool(ws is not None and not ws.closed)

    async def start(self, auth_code: str) -> None:
        if self.connected:
            return
        if not auth_code:
            raise GatewaySessionError("缺少网关授权码")
        self._closed = False
        self._client_seq = 1
        self._server_seq = 0
        self._pending.clear()
        self._http = ClientSession(headers=self.headers)
        self.ws_url = self._build_ws_url(auth_code)
        try:
            self._ws = await self._http.ws_connect(
                self.ws_url,
                heartbeat=self.cfg.ws_heartbeat,
                origin=self.origin,
                autoclose=True,
                autoping=True,
            )
        except Exception as e:
            err_text = str(e or "")
            await self._hard_close()
            lowered = err_text.lower()
            if "invalid response status" in lowered and "400" in lowered:
                raise GatewayAuthCodeInvalidError(
                    "网关连接失败：网关鉴权失败(HTTP 400)，网关授权码可能已失效"
                ) from e
            raise GatewaySessionError(f"网关连接失败：{e}") from e
        self._recv_task = asyncio.create_task(self._recv_loop())

    async def stop(self) -> None:
        async with self._close_lock:
            await self._hard_close()

    async def reconnect(self, auth_code: str) -> None:
        await self.stop()
        await self.start(auth_code)

    async def call(self, service: str, method: str, body: bytes) -> bytes:
        if not self.connected:
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
                raise GatewaySessionError("网关连接已关闭")
            await ws.send_bytes(payload)
        try:
            return await asyncio.wait_for(fut, timeout=self.cfg.rpc_timeout)
        except asyncio.TimeoutError as e:
            self._pending.pop(seq, None)
            raise GatewaySessionError(f"请求超时：{service}.{method}") from e

    async def _call_proto(
        self, service: str, method: str, request: Any, reply: TReply
    ) -> TReply:
        body = await self.call(service, method, request.SerializeToString())
        reply.ParseFromString(body)  # type: ignore
        return reply

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
                        continue
                elif msg.type in {WSMsgType.CLOSE, WSMsgType.CLOSED}:
                    break
                elif msg.type == WSMsgType.ERROR:
                    break
        except Exception as e:
            logger.error(f"网关接收循环异常：{e}")
        finally:
            await self._fail_all_pending("网关连接已断开")
            await self._hard_close(called_from_recv=True)

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

    async def _fail_all_pending(self, reason: str) -> None:
        pending = list(self._pending.items())
        self._pending.clear()
        for _, fut in pending:
            if not fut.done():
                fut.set_exception(GatewaySessionError(reason))

    async def _hard_close(self, *, called_from_recv: bool = False) -> None:
        self._closed = True
        await self._fail_all_pending("网关连接已断开")
        recv_task = self._recv_task
        self._recv_task = None
        current = asyncio.current_task()
        if (
            recv_task is not None
            and not recv_task.done()
            and (not called_from_recv or recv_task is not current)
        ):
            recv_task.cancel()
            try:
                await recv_task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        ws = self._ws
        self._ws = None
        if ws is not None and not ws.closed:
            try:
                await ws.close()
            except Exception:
                pass
        http = self._http
        self._http = None
        if http is not None and not http.closed:
            await http.close()
        await self.notify_dispatcher.clear()
