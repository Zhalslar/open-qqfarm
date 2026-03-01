from __future__ import annotations

import asyncio
import time
from typing import Any

from ..config import CoreConfig
from ..models import RuntimeState
from ..session import GatewayGameSession
from ..session.gateway import GatewayAuthCodeInvalidError, GatewaySessionError
from .account_service import AccountService
from .farm_service import FarmService
from .friend_farm_service import FriendFarmService
from .login_service import LoginService
from .notify_service import NotifyService
from .log_service import logger


class AutomationService:
    def __init__(
        self,
        config: CoreConfig,
        runtime: RuntimeState,
        session: GatewayGameSession,
        account: AccountService,
        login: LoginService,
        farm: FarmService,
        friend: FriendFarmService,
        notify: NotifyService,
    ) -> None:
        self.cfg = config
        self.runtime = runtime
        self.session = session
        self.account = account
        self.login = login
        self.farm = farm
        self.friend = friend
        self.notify = notify

        self._tasks: list[asyncio.Task[Any]] = []
        self._next_farm_at = 0.0
        self._next_friend_at = 0.0

        self._connect_lock = asyncio.Lock()

    # ==============================
    # 生命周期控制
    # ==============================

    def start(self) -> None:
        logger.info("自动化调度启动中...")
        self._tasks = [
            asyncio.create_task(self._runtime_loop()),
            asyncio.create_task(self._heartbeat_loop()),
            asyncio.create_task(self._farm_loop()),
            asyncio.create_task(self._friend_farm_loop()),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            if not task.done():
                task.cancel()

        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning(f"自动化任务停止时异常: {e}")

        self._tasks.clear()
        logger.info("自动化调度已停止")

    # ==============================
    # 运行循环
    # ==============================

    async def _runtime_loop(self) -> None:
        """运行循环，运行周期的核心逻辑"""
        while self.runtime.running:
            try:
                if self.runtime.is_ready:
                    pass
                elif self.runtime.logging_in:
                    pass
                elif not self.runtime.has_auth_code:
                    await self.login.start_login()
                else:
                    async with self._connect_lock:
                        try:
                            await self.session.start(self.account.auth_code)
                        except GatewayAuthCodeInvalidError:
                            self.runtime.connected = False
                            self.account.clear_auth_code()
                        except GatewaySessionError:
                            self.runtime.connected = False
                        else:
                            await self.session.notify_dispatcher.on(
                                "*", self.notify.handle_message
                            )
                            await self.account.update_from_session()
                            await self.account.update_coupon_from_session()
                            now = time.time()
                            self._next_farm_at = now
                            self._next_friend_at = now
                            self.runtime.connected = True

                await asyncio.sleep(1)

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(f"重连循环异常: {e}")
                await asyncio.sleep(1.0)

    # ==============================
    # 心跳循环
    # ==============================

    async def _heartbeat_loop(self) -> None:
        while self.runtime.running:
            try:
                await asyncio.sleep(self.cfg.user_heartbeat)

                if not self.runtime.is_ready or not self.account.gid:
                    continue

                await self.session.user_heartbeat(self.account.gid)

            except asyncio.CancelledError:
                return
            except Exception as e:
                self.runtime.connected = False
                logger.warning(f"心跳循环异常，已标记未连接: {e}")

    # ==============================
    # 自家农场自动调度
    # ==============================

    async def _farm_loop(self) -> None:
        while self.runtime.running:
            try:
                if not self.runtime.is_ready:
                    await asyncio.sleep(1.0)
                    continue

                now = time.time()

                if now < self._next_farm_at:
                    await asyncio.sleep(1.0)
                    continue

                farm_interval = self.cfg.get_random_farm_interval()
                self._next_farm_at = now + farm_interval

                if not self.cfg.farm.enable_auto:
                    continue

                logger.debug(
                    f"[调度器] 触发农场自动作业，{farm_interval} 秒后会再次触发"
                )

                try:
                    await self.farm.run_all()
                except GatewaySessionError:
                    self.runtime.connected = False
                    raise

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(f"农场调度异常: {e}")
                await asyncio.sleep(1.0)

    # ==============================
    # 好友农场自动调度
    # ==============================

    async def _friend_farm_loop(self) -> None:
        while self.runtime.running:
            try:
                if not self.runtime.is_ready:
                    await asyncio.sleep(1.0)
                    continue

                now = time.time()

                if now < self._next_friend_at:
                    await asyncio.sleep(1.0)
                    continue

                friend_interval = self.cfg.get_random_friend_interval()
                self._next_friend_at = now + friend_interval

                if not self.cfg.friend.enable_auto:
                    continue

                logger.debug(
                    f"[调度器] 触发自动打理好友农场, {friend_interval} 秒后会再次触发"
                )

                try:
                    await self.friend.run_all()
                except GatewaySessionError:
                    self.runtime.connected = False
                    raise

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(f"好友农场调度异常: {e}")
                await asyncio.sleep(1.0)
