from __future__ import annotations
from google.protobuf.json_format import MessageToDict

import asyncio
import time
from collections.abc import Awaitable, Callable

from ..config import CoreConfig
from ..models import NotifyType, RuntimeState
from ..proto import (
    friendpb_pb2,
    game_pb2,
    notifypb_pb2,
    plantpb_pb2,
    taskpb_pb2,
    userpb_pb2,
)
from ..session import GatewayGameSession
from .account_service import AccountService
from .farm_service import FarmService
from .friend_service import FriendService
from .log_service import logger
from .task_reward_service import TaskRewardService


class NotifyService:
    def __init__(
        self,
        config: CoreConfig,
        account: AccountService,
        runtime: RuntimeState,
        session: GatewayGameSession,
        farm: FarmService,
        friend_service: FriendService,
        task_reward: TaskRewardService,
    ) -> None:
        self.cfg = config
        self.account = account
        self.runtime = runtime
        self.session = session
        self.farm = farm
        self.friends = friend_service
        self.task_reward = task_reward

        self._last_land_push_ts = 0.0
        self._land_push_cd = 0.2
        self._last_item_push_ts = 0.0
        self._item_push_cd = 0.5

        self._handlers: dict[NotifyType, Callable[[bytes], Awaitable[None]]] = {
            NotifyType.LANDS: self._handle_lands,
            NotifyType.ITEM: self._handle_item,
            NotifyType.TASK_INFO: self._handle_task_info,
            NotifyType.FRIEND_APPLICATION_RECEIVED: self._handle_friend_application_received,
            NotifyType.BASIC: self._handle_basic,
            NotifyType.KICKOUT: self._handle_kickout,
        }
        self._enabled_notifies = self._load_enabled_notifies()

    def _load_enabled_notifies(self) -> set[NotifyType]:
        raw_actions = self.cfg.notify.actions or []
        enabled: set[NotifyType] = set()
        for action in raw_actions:
            notify_type = NotifyType.parse(action)
            if notify_type is None:
                logger.warning("忽略未知通知类型配置", notify_type=action)
                continue
            if notify_type in self._handlers:
                enabled.add(notify_type)
        return enabled

    async def handle_message(self, message_type: str, payload: bytes) -> None:
        notify_type = NotifyType.from_message_type(message_type)
        if notify_type is None or notify_type not in self._enabled_notifies:
            return

        handler = self._handlers.get(notify_type)
        if handler:
            await handler(payload)

    async def _handle_lands(self, payload: bytes) -> None:
        if not self.cfg.farm.enable_auto:
            return

        now = time.time()
        if now - self._last_land_push_ts < self._land_push_cd:
            return
        self._last_land_push_ts = now

        notify = plantpb_pb2.LandsNotify()
        notify.ParseFromString(payload)
        self.farm.land.invalidate_cache(host_gid=int(notify.host_gid), friend=None)
        land_ids = [land.id for land in notify.lands]
        logger.debug(
            "收到地块信息推送，触发一轮农场作业",
            host_gid=notify.host_gid,
            land_ids=land_ids,
            crop_names=self.farm.land.collect_crop_names(notify.lands),
        )
        asyncio.create_task(self.farm.run_all())

    async def _handle_item(self, payload: bytes) -> None:
        notify = notifypb_pb2.ItemNotify()
        notify.ParseFromString(payload)
        logger.debug("收到通知", items=MessageToDict(notify))
        self.account.update_from_notify(notify.items)

    async def _handle_task_info(self, payload: bytes) -> None:
        notify = taskpb_pb2.TaskInfoNotify()
        notify.ParseFromString(payload)
        if self.cfg.auto_reward:
            logger.debug("收到任务信息推送，开始尝试自动领奖")
            asyncio.create_task(self.task_reward.check_and_claim_tasks())

    async def _handle_friend_application_received(self, payload: bytes) -> None:
        notify = friendpb_pb2.FriendApplicationReceivedNotify()
        notify.ParseFromString(payload)
        await self.friends.accept_applications_from_notify(list(notify.applications))

    async def _handle_basic(self, payload: bytes) -> None:
        notify = userpb_pb2.BasicNotify()
        notify.ParseFromString(payload)
        logger.debug("收到用户基础信息推送, 开始更新账号信息")
        self.account.update_from_basic(notify.basic)

    async def _handle_kickout(self, payload: bytes) -> None:
        notify = game_pb2.KickoutNotify()
        notify.ParseFromString(payload)
        self.runtime.connected = False
        logger.warning(
            "账号被踢下线",
            reason=notify.reason,
            message=notify.reason_message,
        )
