from __future__ import annotations

import time

from ..config import CoreConfig
from ..proto import Application, GameFriend
from ..session import GatewayGameSession
from .account_service import AccountService
from .log_service import logger


class FriendService:
    def __init__(
        self,
        config: CoreConfig,
        account: AccountService,
        session: GatewayGameSession,
    ) -> None:
        self.cfg = config.friend
        self.account = account
        self.session = session

        self.friends_cache: list[GameFriend] | None = None
        self.friends_gid_map: dict[int, GameFriend] | None = None
        self.friends_name_map: dict[str, GameFriend] | None = None

    def clear_cache(self) -> None:
        self.friends_cache = None
        self.friends_gid_map = None
        self.friends_name_map = None
        logger.debug("好友缓存已清空")

    @staticmethod
    def _is_valid_friend(friend: GameFriend, self_gid: int) -> bool:
        return friend.gid != self_gid and friend.name != "小小农夫"

    async def get_all_friends(self, cache: bool = False) -> list[GameFriend]:
        if cache and self.friends_cache is not None:
            return self.friends_cache
        try:
            all_friends = await self.session.friend_get_all()
        except Exception as e:
            logger.warning(f"拉取好友列表失败: {e}")
            return []

        friends = [
            friend
            for friend in all_friends
            if self._is_valid_friend(friend, self.account.gid)
        ]
        self.friends_cache = friends
        self.friends_gid_map = {f.gid: f for f in friends}
        self.friends_name_map = {f.name: f for f in friends}
        logger.info("好友列表加载完成", count=len(friends))
        return friends

    async def get_friend_by_gid(
        self, gid: int, cache: bool = False
    ) -> GameFriend | None:
        if cache and self.friends_gid_map:
            return self.friends_gid_map.get(gid)
        if self.friends_gid_map is None:
            await self.get_all_friends(cache=False)
        if self.friends_gid_map:
            return self.friends_gid_map.get(gid)
        return None

    async def get_friend_by_name(
        self, name: str, cache: bool = False
    ) -> GameFriend | None:
        if cache and self.friends_name_map:
            return self.friends_name_map.get(name)
        if self.friends_name_map is None:
            await self.get_all_friends(cache=False)
        if self.friends_name_map:
            return self.friends_name_map.get(name)
        return None

    async def sync_friends_by_open_ids(self, open_ids: list[str]) -> list[GameFriend]:
        friends = await self.session.friend_sync_all(open_ids)
        rows = [
            friend
            for friend in friends
            if self._is_valid_friend(friend, self.account.gid)
        ]
        self.friends_cache = rows
        self.friends_gid_map = {f.gid: f for f in rows}
        self.friends_name_map = {f.name: f for f in rows}
        logger.info("按 open_id 同步好友完成", count=len(rows))
        return rows

    async def get_friend_applications(self) -> list[Application]:
        try:
            rows = await self.session.friend_get_applications()
            logger.info("拉取好友申请完成", count=len(rows))
            return rows
        except Exception as e:
            logger.warning(f"拉取好友申请失败: {e}")
            return []

    async def accept_friends(self, friend_gids: list[int]) -> list[GameFriend]:
        try:
            accepted = await self.session.friend_accept(friend_gids)
            if accepted:
                self.clear_cache()
            logger.info("同意好友申请完成", count=len(accepted))
            return accepted
        except Exception as e:
            logger.warning(f"同意好友申请失败: {e}")
            return []

    async def reject_friends(self, friend_gids: list[int]) -> int:
        try:
            return await self.session.friend_reject(friend_gids)
        except Exception as e:
            logger.warning(f"拒绝好友申请失败: {e}")
            return 0

    async def set_block_applications(self, block: bool) -> bool:
        try:
            return await self.session.friend_set_block_applications(block)
        except Exception as e:
            logger.warning(f"设置好友申请拦截失败: {e}")
            return False

    async def accept_all_friend_applications(self) -> list[GameFriend]:
        applications = await self.get_friend_applications()
        gids = [int(app.gid) for app in applications if int(app.gid) > 0]
        if not gids:
            logger.info("没有待处理的好友申请")
            return []
        return await self.accept_friends(gids)

    @staticmethod
    def _format_time(ts: int) -> str:
        raw = int(ts)
        if raw <= 0:
            return ""
        sec = raw // 1000 if raw > 1_000_000_000_000 else raw
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(sec))

    @classmethod
    def _to_application_row(cls, app: Application) -> dict[str, int | str]:
        return {
            "gid": int(app.gid),
            "name": str(app.name),
            "level": int(app.level),
            "open_id": str(app.open_id),
            "time_at": cls._format_time(int(app.time_at)),
        }

    @staticmethod
    def _to_friend_row(friend: GameFriend) -> dict[str, int | str]:
        return {
            "gid": int(friend.gid),
            "name": str(friend.name),
            "level": int(friend.level),
            "open_id": str(friend.open_id),
        }

    async def accept_applications_from_notify(
        self, applications: list[Application]
    ) -> list[GameFriend]:
        valid_apps = [app for app in applications if int(app.gid) > 0]
        if not valid_apps:
            logger.info("好友申请推送中没有可处理申请")
            return []

        app_rows = [self._to_application_row(app) for app in valid_apps]
        logger.info("收到好友申请", count=len(app_rows), applications=app_rows)

        gids = list(dict.fromkeys(int(app.gid) for app in valid_apps))
        accepted = await self.accept_friends(gids)
        accepted_rows = [self._to_friend_row(friend) for friend in accepted]
        logger.info(
            "已自动接受好友申请",
            request_count=len(gids),
            accepted_count=len(accepted_rows),
            accepted=accepted_rows,
        )
        return accepted
