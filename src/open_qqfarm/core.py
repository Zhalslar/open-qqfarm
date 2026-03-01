from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from .config import CoreConfig
from .services.game_data_service import GameDataService
from .services.login_service import LoginService
from .models import OperationType, RuntimeState, TaskClaimResult
from .services import (
    AccountService,
    AutomationService,
    FarmService,
    FriendService,
    FriendFarmService,
    LandService,
    NotifyService,
    OperationLimitService,
    TaskRewardService,
    WarehouseService,
    logger,
    statistician,
)
from .session import GatewayGameSession


class QFarmCoreAPP:
    def __init__(self, config: MutableMapping[str, Any] | None = None):
        self.cfg = CoreConfig(config)
        self.runtime = RuntimeState()
        self.limiter = OperationLimitService()

        self.gdata = GameDataService(self.cfg)
        self.session = GatewayGameSession(self.cfg)
        self.account = AccountService(self.cfg, self.runtime, self.gdata, self.session)
        self.login = LoginService(self.cfg, self.runtime, self.account)

        self.warehouse = WarehouseService(self.gdata, self.session, self.account)
        self.land = LandService(self.account, self.gdata)
        self.farm = FarmService(
            self.cfg,
            self.gdata,
            self.account,
            self.session,
            self.warehouse,
            self.land,
        )
        self.friends = FriendService(
            self.cfg,
            self.account,
            self.session,
        )
        self.friend = FriendFarmService(
            self.cfg,
            self.session,
            self.warehouse,
            self.friends,
            self.land,
        )
        self.task_rewards = TaskRewardService(self.session)
        self.notify = NotifyService(
            self.cfg,
            self.account,
            self.runtime,
            self.session,
            self.farm,
            self.friends,
            self.task_rewards,
        )
        self.automation = AutomationService(
            self.cfg,
            self.runtime,
            self.session,
            self.account,
            self.login,
            self.farm,
            self.friend,
            self.notify,
        )
        self._connect_lock = asyncio.Lock()
        logger.info("QQ 农场核心初始化完成")

    # ============ lifecycle  ============

    async def start(self):
        if self.runtime.running:
            return
        self.runtime.mark_started()
        self.automation.start()
        logger.info("QQ 农场核心启动完成")

    async def stop(self):
        if not self.runtime.running:
            return
        self.runtime.mark_stopped()
        await self.automation.stop()
        await self.session.stop()
        await self.login.shutdown()
        logger.info("QQ 农场核心已停止")


    # ============ login ============

    async def start_login(self, notify: Callable[[str], Awaitable[None]] | None = None):
        await self.login.start_login(notify=notify)

    async def cancel_login(self) -> None:
        await self.login.cancel_login()

    async def logout(self) -> None:
        await self.session.stop()
        self.runtime.connected = False
        self.account.clear_auth_code()
        logger.info("账号已退出登录", user=self.account.get_user_info())

    # =========== work ============

    async def ensure_ready(self) -> None:
        if self.runtime.is_ready:
            return
        if self.runtime.logging_in:
            raise RuntimeError("当前登录中，请稍后重试")
        await asyncio.sleep(1.5)
        if self.runtime.is_ready:
            return
        raise RuntimeError("当前未就绪，请稍后重试")

    async def get_all_lands(self, gid: int | None = None):
        await self.ensure_ready()
        gid = gid or self.account.gid
        return await self.session.plant_all_lands(gid)

    async def get_friend_lands(self, gid: int):
        await self.ensure_ready()
        return await self.session.visit_enter_friend(gid)

    async def do_farm_all(self):
        await self.ensure_ready()
        return await self.farm.run_all()

    async def do_farm_weed(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.WEED)

    async def do_farm_insect(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.INSECT)

    async def do_farm_water(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.WATER)

    async def do_farm_harvest(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.HARVEST)

    async def do_farm_sell(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.SELL)

    async def do_farm_plant(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.PLANT)

    async def do_farm_remove(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.REMOVE)

    async def do_farm_unlock(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.UNLOCK)

    async def do_farm_upgrade(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.UPGRADE)

    async def do_farm_normal_fertilize(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.NORMAL_FERTILIZE)

    async def do_farm_organic_fertilize(self):
        await self.ensure_ready()
        return await self.farm.run_single(OperationType.ORGANIC_FERTILIZE)

    async def get_all_friends(self):
        await self.ensure_ready()
        return await self.friends.get_all_friends()

    async def get_friend_by_gid(self, gid: int, cache: bool = True):
        await self.ensure_ready()
        return await self.friends.get_friend_by_gid(gid, cache=cache)

    async def get_friend_by_name(self, name: str, cache: bool = True):
        await self.ensure_ready()
        return await self.friends.get_friend_by_name(name, cache=cache)

    async def sync_friends_by_open_ids(self, open_ids: list[str]):
        await self.ensure_ready()
        return await self.friends.sync_friends_by_open_ids(open_ids)

    async def get_friend_applications(self):
        await self.ensure_ready()
        return await self.friends.get_friend_applications()

    async def accept_friends(self, friend_gids: list[int]):
        await self.ensure_ready()
        return await self.friends.accept_friends(friend_gids)

    async def reject_friends(self, friend_gids: list[int]) -> int:
        await self.ensure_ready()
        return await self.friends.reject_friends(friend_gids)

    async def accept_all_friend_applications(self):
        await self.ensure_ready()
        return await self.friends.accept_all_friend_applications()

    async def set_block_applications(self, block: bool) -> bool:
        await self.ensure_ready()
        return await self.friends.set_block_applications(block)

    async def do_friend_all(self):
        await self.ensure_ready()
        return await self.friend.run_all()

    async def do_friend_steal(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.STEAL)

    async def do_friend_water(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.HELP_WATER)

    async def do_friend_weed(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.HELP_WEED)

    async def do_friend_insect(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.HELP_INSECT)

    async def do_friend_put_insect(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.PUT_INSECT)

    async def do_friend_put_weed(self, gid: int):
        await self.ensure_ready()
        return await self.friend.run_single(gid, OperationType.PUT_WEED)

    async def get_goods_list(self):
        await self.ensure_ready()
        return await self.warehouse.get_goods_list()

    async def get_available_goods_list(self, shop_id: int = 2):
        await self.ensure_ready()
        return await self.warehouse.get_available_goods_list(shop_id=shop_id)

    async def buy_goods(self, goods_id: int, num: int, price: int):
        await self.ensure_ready()
        return await self.warehouse.buy_goods(goods_id=goods_id, num=num, price=price)

    async def get_bag_items(self):
        await self.ensure_ready()
        return await self.warehouse.get_bag_items()

    async def get_fruit_items(self, sellable_only: bool = False):
        await self.ensure_ready()
        return await self.warehouse.get_fruit_items(sellable_only=sellable_only)

    async def get_item_count(self, item_id: int):
        await self.ensure_ready()
        return await self.warehouse.get_item_count(item_id)

    async def sell_items(self, items):
        await self.ensure_ready()
        return await self.warehouse.sell_items(items)

    async def sell_all_fruits(self):
        await self.ensure_ready()
        return await self.warehouse.sell_all_fruits()

    async def choose_seed(self):
        await self.ensure_ready()
        return await self.farm.choose_seed()

    async def check_and_claim_tasks(self) -> TaskClaimResult:
        await self.ensure_ready()
        return await self.task_rewards.check_and_claim_tasks()

    # =========== game data ============

    def get_all_seeds(self, current_level: int | None = None):
        level = self.account.level if current_level is None else int(current_level)
        return self.gdata.get_all_seeds(level)

    def get_seed_unlock_level(self, seed_id: int) -> int:
        return self.gdata.get_seed_unlock_level(seed_id)

    def get_seed_price(self, seed_id: int) -> int:
        return self.gdata.get_seed_price(seed_id)

    def get_fruit_price(self, fruit_id: int) -> int:
        return self.gdata.get_fruit_price(fruit_id)

    def get_item_by_id(self, item_id: int):
        return self.gdata.get_item_by_id(item_id)

    def get_fruit_name(self, fruit_id: int) -> str:
        return self.gdata.get_fruit_name(fruit_id)

    def get_plant_by_fruit(self, fruit_id: int):
        return self.gdata.get_plant_by_fruit(fruit_id)

    def get_plant_by_seed(self, seed_id: int):
        return self.gdata.get_plant_by_seed(seed_id)

    def get_plant_name_by_seed(self, seed_id: int) -> str:
        return self.gdata.get_plant_name_by_seed(seed_id)

    def get_plant_name(self, plant_id: int) -> str:
        return self.gdata.get_plant_name(plant_id)

    def get_seed_image(self, seed_id: int) -> str:
        return self.gdata.get_seed_image(seed_id)

    # =========== limits & stats ============

    def get_operation_limit(self, operation_id: int):
        return self.limiter.get(operation_id)

    def get_all_operation_limits(self):
        return self.limiter.get_all()

    def can_operate(self, operation_id: int) -> bool:
        return self.limiter.can_operate(operation_id)

    def can_get_exp(self, operation_id: int) -> bool:
        return self.limiter.can_get_exp(operation_id)

    def get_remaining_operation_times(self, operation_id: int) -> int:
        return self.limiter.get_remaining_times(operation_id)

    def get_statistics(self) -> dict[str, int]:
        return statistician.as_dict()

    def get_operation_stat(self, op_type: OperationType) -> int:
        return statistician.get(op_type)

    def reset_statistics(self) -> None:
        statistician.reset()
