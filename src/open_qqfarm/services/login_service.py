from __future__ import annotations

import asyncio
import sys
from collections.abc import Awaitable, Callable
from io import StringIO
from pathlib import Path
from typing import Final
from urllib.parse import quote

import aiohttp
import segno

from ..config import CoreConfig
from ..models import RuntimeState, ScanState, ScanStatus
from .account_service import AccountService
from .log_service import logger


class LoginService:
    CODE_URL: Final = "https://q.qq.com/ide/devtoolAuth/GetLoginCode"
    QLOGIN_URL: Final = "https://h5.qzone.qq.com/qqq/code"
    SCAN_URL: Final = "https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket"
    LOGIN_URL: Final = "https://q.qq.com/ide/login"
    QR_FILE_NAME: Final = "login_qr.svg"

    def __init__(
        self,
        config: CoreConfig,
        runtime: RuntimeState,
        account: AccountService,
    ) -> None:
        self.cfg = config
        self.runtime = runtime
        self.account = account


        self.appid = config.client.appid
        self.login_timeout = 20
        self.poll_timeout = 120
        self.pull_interval = 1
        self.qr_code_path = self.cfg.qr_code_dir / self.QR_FILE_NAME
        self.headers = {
            "qua": "V1_HT5_QDT_0.70.2209190_x64_0_DEV_D",
            "host": "q.qq.com",
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        }

        self.session = aiohttp.ClientSession(
            headers=self.headers,
            timeout=aiohttp.ClientTimeout(total=self.login_timeout),
        )

        self._login_task: asyncio.Task[None] | None = None

    async def shutdown(self) -> None:
        task = self._login_task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        await self.session.close()
        logger.info("登录服务已关闭")

    async def cancel_login(self) -> None:
        task = self._login_task
        if task is None or task.done():
            return
        logger.info("取消登录任务")
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def start_login(
        self,
        notify: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        if self._login_task and not self._login_task.done():
            await self._emit("已有登录任务进行中", notify=notify, level="warning")
            return
        self.runtime.logging_in = True
        logger.debug("开始执行登录流程...")
        try:
            code = await self.request_login_code()
            login_url = self._build_login_url(code)
            await self._emit(
                f"【登录码链接】({self.poll_timeout} 秒内有效): {login_url}",
                notify=notify,
            )

            qr_code_path, qr_terminal = self._update_login_qr(code)
            await self._emit(
                f"【登录二维码】({self.poll_timeout} 秒内有效): {qr_code_path}",
                notify=notify,
            )
            logger.info(f"请 {self.poll_timeout} 秒内使用 QQ 扫码登录:")
            self._print_qr_terminal(qr_terminal)

            self._login_task = asyncio.create_task(
                self._poll_login(code=code, notify=notify)
            )
            self._login_task.add_done_callback(
                lambda _: setattr(self, "_login_task", None)
            )
        except Exception as e:
            self.runtime.logging_in = False
            logger.error("登录失败", error=str(e))

    def _build_login_url(self, code: str) -> str:
        return f"{self.QLOGIN_URL}/{code}?_proxy=1&from=ide"

    async def _emit(
        self,
        message: str,
        *,
        notify: Callable[[str], Awaitable[None]] | None = None,
        level: str = "debug",
        **fields: object,
    ) -> None:
        log_method = getattr(logger, level, logger.info)
        log_method("登录通知", message=message, **fields)
        if not notify:
            return
        try:
            await notify(message)
        except Exception as e:
            logger.warning("通知回调执行失败", error=str(e))

    def _print_qr_terminal(self, qr_terminal: str) -> None:
        try:
            print("")
            print(qr_terminal, flush=True)
        except UnicodeEncodeError:
            encoding = sys.stdout.encoding or "utf-8"
            safe_qr = qr_terminal.encode(encoding, errors="replace").decode(
                encoding, errors="replace"
            )
            print(safe_qr, flush=True)
            logger.warning("终端编码不支持二维码字符，已降级显示", encoding=encoding)

    def _update_login_qr(self, code: str) -> tuple[Path, str]:
        login_url = self._build_login_url(code)
        qr = segno.make(login_url)
        qr.save(str(self.qr_code_path), scale=8)
        out = StringIO()
        qr.terminal(out=out, compact=True)
        qr_terminal = out.getvalue()
        return self.qr_code_path, qr_terminal

    async def _poll_login(
        self,
        *,
        code: str,
        notify: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        try:
            current_code = code
            refresh_count = 0
            refresh_limit = 3

            while True:
                for _ in range(self.poll_timeout):
                    await asyncio.sleep(self.pull_interval)

                    state = await self.query_status(current_code)
                    match state:
                        case ScanState(status=ScanStatus.WAIT):
                            continue

                        case ScanState(status=ScanStatus.USED):
                            refresh_count += 1
                            if refresh_count > refresh_limit:
                                await self._emit(
                                    "登录码已失效，请重新发起绑定",
                                    notify=notify,
                                    level="warning",
                                )
                                return

                            await self._emit(
                                "登录码已失效，正在自动刷新...",
                                notify=notify,
                                refresh_count=refresh_count,
                            )
                            break

                        case ScanState(status=ScanStatus.ERROR, error=err):
                            await self._emit(
                                f"登录失败: {err}",
                                notify=notify,
                                level="warning",
                                error=err,
                            )
                            return

                        case ScanState(status=ScanStatus.OK, ticket=ticket, uin=uin):
                            auth_code = await self._get_auth_code(ticket)
                            if not auth_code:
                                await self._emit(
                                    "登录成功但未获取到网关授权码，请重试",
                                    notify=notify,
                                    level="warning",
                                    uin=uin,
                                )
                                return

                            self.account.set_uin(uin)
                            self.account.set_auth_code(auth_code)
                            await self._emit(f"登录成功：{uin}", notify=notify, uin=uin)
                            return

                else:
                    await self._emit(
                        f"登录超时（{self.poll_timeout}秒）",
                        notify=notify,
                        level="warning",
                        timeout=self.poll_timeout,
                    )
                    return

                current_code = await self.request_login_code()
                login_url = self._build_login_url(current_code)
                _, qr_terminal = self._update_login_qr(current_code)

                await self._emit(
                    f"登录码已刷新(请在 {self.poll_timeout} 秒内完成操作): {login_url}",
                    notify=notify,
                )
                print("\n[open-qqfarm] 登录二维码已刷新，请重新扫码：")
                self._print_qr_terminal(qr_terminal)
                logger.info("登录码刷新完成")

        except asyncio.CancelledError:
            await self._emit("登录任务已取消", notify=notify)

        except Exception as e:
            await self._emit(f"登录异常: {e}", notify=notify, level="error")
        finally:
            self.runtime.logging_in = False

    async def request_login_code(self) -> str:
        async with self.session.get(self.CODE_URL) as resp:
            data = await resp.json(content_type=None)

        if data.get("code") != 0:
            raise RuntimeError("获取登录码失败")

        code = data.get("data", {}).get("code")
        if not code:
            raise RuntimeError("登录码为空")

        logger.debug("获取登录码成功")
        return str(code)

    async def query_status(self, code: str) -> ScanState:
        url = f"{self.SCAN_URL}?code={quote(code, safe='')}"

        async with self.session.get(url) as resp:
            if resp.status != 200:
                return ScanState(
                    status=ScanStatus.ERROR,
                    error=f"HTTP {resp.status}",
                )
            data = await resp.json()
            # logger.debug(f"查询登录状态: {data}")
            # {'code': 0, 'data': {'code': 'eea0ed51a7a93fec595490759cb225d0', 'ticket': '2e2d23d6c21ad193daf6178abbff4a65', 'ok': 1, 'uin': '2936169201'}, 'message': ''}

        res_code = data.get("code")
        payload = data.get("data", {})

        if res_code == 0:
            if payload.get("ok") != 1:
                return ScanState(status=ScanStatus.WAIT)

            return ScanState(
                status=ScanStatus.OK,
                ticket=payload.get("ticket", ""),
                uin=payload.get("uin", ""),
            )

        if res_code == -10003:
            return ScanState(status=ScanStatus.USED)

        return ScanState(
            status=ScanStatus.ERROR,
            error=f"Code: {res_code}",
        )

    async def _get_auth_code(self, ticket: str) -> str:
        payload = {
            "appid": self.appid,
            "ticket": ticket,
        }
        async with self.session.post(self.LOGIN_URL, json=payload) as resp:
            if resp.status != 200:
                logger.warning("获取网关授权码失败：HTTP状态异常", status=resp.status)
                return ""
            data = await resp.json(content_type=None)
            logger.debug(f"获取网关授权码: {data}")
            #  {'code': '3e7e436519fc8565fbfd9ebb8daa0570', 'message': 'success'}

        return str(data.get("code") or "")
