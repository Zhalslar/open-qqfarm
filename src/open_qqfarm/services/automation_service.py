from __future__ import annotations

import asyncio
import time
from typing import Any

from ..config import CoreConfig
from ..models import RuntimeState
from ..session import GatewayGameSession
from ..session.gateway import GatewaySessionError
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
        self._farm_loop_status = self._new_loop_status()
        self._friend_loop_status = self._new_loop_status()

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

    @staticmethod
    def _new_loop_status() -> dict[str, Any]:
        return {
            "running": False,
            "total_steps": 0,
            "completed_steps": 0,
            "current_action": "",
            "current_index": -1,
            "current_action_count": 0,
            "last_action": "",
            "last_action_seq": 0,
            "last_action_at": 0.0,
            "started_at": 0.0,
            "finished_at": 0.0,
        }

    def _reset_loop_status(self, status: dict[str, Any]) -> None:
        status["running"] = False
        status["total_steps"] = 0
        status["completed_steps"] = 0
        status["current_action"] = ""
        status["current_index"] = -1
        status["current_action_count"] = 0
        status["started_at"] = 0.0
        status["finished_at"] = 0.0

    def _begin_loop_status(self, status: dict[str, Any], total_steps: int) -> None:
        status["running"] = True
        status["total_steps"] = max(0, int(total_steps))
        status["completed_steps"] = 0
        status["current_action"] = ""
        status["current_index"] = -1
        status["current_action_count"] = 0
        status["started_at"] = time.time()
        status["finished_at"] = 0.0

    def _record_loop_step(
        self,
        status: dict[str, Any],
        *,
        loop_key: str = "",
        op: str,
        completed_steps: int,
        total_steps: int,
        ok: bool = False,
        count: int = 0,
        effective: bool | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        seq = int(status.get("last_action_seq", 0)) + 1
        now = time.time()
        action = str(op or "")
        effect_count = max(0, int(count or 0))
        is_effective = bool(ok) and effect_count > 0
        if effective is not None:
            is_effective = bool(effective)
        status["total_steps"] = max(0, int(total_steps))
        status["completed_steps"] = max(
            0,
            min(int(completed_steps), int(status["total_steps"] or 0)),
        )
        status["current_action"] = action
        status["current_index"] = max(0, int(status["completed_steps"]) - 1)
        status["current_action_count"] = effect_count
        status["last_action"] = action
        status["last_action_seq"] = seq
        status["last_action_at"] = now
        if is_effective and action:
            action_fields: dict[str, int] = {}
            source_extra = extra if isinstance(extra, dict) else {}
            if action == "buy_seed":
                action_fields = {
                    "goods_id": max(0, int(source_extra.get("goods_id", 0) or 0)),
                    "item_id": max(0, int(source_extra.get("item_id", 0) or 0)),
                }
            elif action == "plant":
                action_fields = {
                    "item_id": max(0, int(source_extra.get("item_id", 0) or 0)),
                }
            logger.info(
                "农场动作事件",
                event="farm_action",
                source="automation",
                loop=(str(loop_key).strip().lower() if loop_key else ""),
                op=action,
                count=effect_count,
                effective=True,
                **action_fields,
            )

    def _finish_loop_status(self, status: dict[str, Any]) -> None:
        status["running"] = False
        status["current_action"] = ""
        status["current_action_count"] = 0
        total_steps = max(0, int(status.get("total_steps", 0)))
        status["completed_steps"] = max(
            0,
            min(int(status.get("completed_steps", 0)), total_steps),
        )
        status["finished_at"] = time.time()

    def _loop_payload(
        self,
        *,
        enabled: bool,
        base_minute: int,
        actions: list[str],
        next_at: float,
        status: dict[str, Any],
        now: float,
    ) -> dict[str, Any]:
        next_time = float(next_at or 0.0)
        total_steps = max(0, int(status.get("total_steps", 0)))
        completed_steps = max(
            0,
            min(int(status.get("completed_steps", 0)), total_steps),
        )
        remaining_sec = max(0, int(next_time - now))
        progress = (completed_steps / total_steps) if total_steps > 0 else 0.0
        return {
            "enabled": bool(enabled),
            "base_minute": int(base_minute),
            "actions": [str(op) for op in actions],
            "next_at": next_time,
            "remaining_sec": remaining_sec,
            "running": bool(status.get("running", False)),
            "total_steps": total_steps,
            "completed_steps": completed_steps,
            "progress": float(progress),
            "current_action": str(status.get("current_action", "")),
            "current_index": int(status.get("current_index", -1)),
            "current_action_count": max(
                0, int(status.get("current_action_count", 0) or 0)
            ),
            "last_action": str(status.get("last_action", "")),
            "last_action_seq": int(status.get("last_action_seq", 0)),
            "last_action_at": float(status.get("last_action_at", 0.0)),
            "started_at": float(status.get("started_at", 0.0)),
            "finished_at": float(status.get("finished_at", 0.0)),
        }

    def get_status_payload(self) -> dict[str, Any]:
        now = time.time()
        return {
            "server_ts": now,
            "farm": self._loop_payload(
                enabled=bool(self.cfg.farm.enable_auto),
                base_minute=int(self.cfg.farm.base_minute),
                actions=list(self.cfg.farm.actions or []),
                next_at=self._next_farm_at,
                status=self._farm_loop_status,
                now=now,
            ),
            "friend": self._loop_payload(
                enabled=bool(self.cfg.friend.enable_auto),
                base_minute=int(self.cfg.friend.base_minute),
                actions=list(self.cfg.friend.actions or []),
                next_at=self._next_friend_at,
                status=self._friend_loop_status,
                now=now,
            ),
        }

    # ==============================
    # 运行循环
    # ==============================

    async def _ping_network(self) -> bool:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(
                    host="1.1.1.1",
                    port=443,
                ),
                timeout=3,
            )
        except (OSError, asyncio.TimeoutError):
            return False

        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass

        return True

    async def _runtime_loop(self) -> None:
        """运行循环，运行周期的核心逻辑"""
        while self.runtime.running:
            try:
                if self.runtime.is_ready:
                    await asyncio.sleep(1)
                    continue

                if self.runtime.logging_in:
                    await asyncio.sleep(0.5)
                    continue

                if not self.runtime.network_available:
                    if await self._ping_network():
                        pass
                    else:
                        await asyncio.sleep(5)
                        continue

                if not self.runtime.auth_code_valid:
                    if self.account.auth_code:
                        logger.debug(
                            "网关授权码失效，尝试清除账号缓存的网关授权码并重新登录"
                        )
                        self.account.clear_auth_code()
                    await self.login.start_login()
                    await asyncio.sleep(1)
                    continue

                if not self.runtime.connected:
                    try:
                        await self.session.start(self.account.auth_code)
                    except GatewaySessionError:
                        self.runtime.connected = False
                        await asyncio.sleep(1)
                        continue

                    await self.session.notify_dispatcher.on(
                        "*", self.notify.handle_message
                    )
                    account_ready = await self.account.update_from_session()
                    await self.account.update_coupon_from_session()

                    if not self.session.connected:
                        self.runtime.connected = False
                        logger.warning("网关初始化过程中连接已断开，等待重连")
                        await asyncio.sleep(1)
                        continue

                    if not account_ready:
                        self.runtime.connected = False
                        logger.warning("网关已连接但账号初始化未完成，等待重试")
                        await asyncio.sleep(1)
                        continue

                    now = time.time()
                    self._next_farm_at = now
                    self._next_friend_at = now
                    self._reset_loop_status(self._farm_loop_status)
                    self._reset_loop_status(self._friend_loop_status)
                    self.runtime.connected = True
                    logger.info("网关已连接，会话已准备就绪")

                await asyncio.sleep(1)

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(f"重连循环异常: {e}")
                await asyncio.sleep(1)

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
                logger.warning(f"心跳循环异常: {e}")

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

                farm_interval = self.cfg.get_farm_interval()
                self._next_farm_at = now + farm_interval

                if not self.cfg.farm.enable_auto:
                    self._reset_loop_status(self._farm_loop_status)
                    continue

                logger.debug(
                    f"[调度器] 触发农场自动作业，{farm_interval} 秒后会再次触发"
                )

                try:
                    actions = list(self.cfg.farm.actions or [])
                    self._begin_loop_status(
                        self._farm_loop_status, total_steps=len(actions)
                    )
                    await self.farm.run_all(
                        on_progress=lambda payload: self._record_loop_step(
                            self._farm_loop_status,
                            loop_key="farm",
                            op=str(payload.get("op", "")),
                            completed_steps=int(payload.get("completed_steps", 0)),
                            total_steps=int(payload.get("total_steps", 0)),
                            ok=bool(payload.get("ok", False)),
                            count=int(payload.get("count", 0) or 0),
                            effective=(
                                bool(payload.get("effective", False))
                                if "effective" in payload
                                else None
                            ),
                            extra=(
                                payload.get("extra")
                                if isinstance(payload.get("extra"), dict)
                                else None
                            ),
                        )
                    )
                    self._finish_loop_status(self._farm_loop_status)
                except GatewaySessionError:
                    self._finish_loop_status(self._farm_loop_status)
                    self.runtime.connected = False
                    raise
                except Exception:
                    self._finish_loop_status(self._farm_loop_status)
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

                friend_interval = self.cfg.get_friend_interval()
                self._next_friend_at = now + friend_interval

                if not self.cfg.friend.enable_auto:
                    self._reset_loop_status(self._friend_loop_status)
                    continue

                logger.debug(
                    f"[调度器] 触发自动打理好友农场, {friend_interval} 秒后会再次触发"
                )

                try:
                    self._begin_loop_status(self._friend_loop_status, total_steps=0)
                    await self.friend.run_all(
                        on_progress=lambda payload: self._record_loop_step(
                            self._friend_loop_status,
                            loop_key="friend",
                            op=str(payload.get("op", "")),
                            completed_steps=int(payload.get("completed_steps", 0)),
                            total_steps=int(payload.get("total_steps", 0)),
                            ok=bool(payload.get("ok", False)),
                            count=int(payload.get("count", 0) or 0),
                            effective=(
                                bool(payload.get("effective", False))
                                if "effective" in payload
                                else None
                            ),
                            extra=(
                                payload.get("extra")
                                if isinstance(payload.get("extra"), dict)
                                else None
                            ),
                        )
                    )
                    self._finish_loop_status(self._friend_loop_status)
                except GatewaySessionError:
                    self._finish_loop_status(self._friend_loop_status)
                    self.runtime.connected = False
                    raise
                except Exception:
                    self._finish_loop_status(self._friend_loop_status)
                    raise

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning(f"好友农场调度异常: {e}")
                await asyncio.sleep(1.0)
