from __future__ import annotations

from .game_data_service import GameDataService
from ..models import OperationType, SellFruitsResult
from ..proto import GoodsInfo, Item
from ..session import GatewayGameSession
from .account_service import AccountService
from .log_service import logger
from .statistics_service import statistician


class WarehouseService:
    def __init__(
        self,
        gdata: GameDataService,
        session: GatewayGameSession,
        account: AccountService,
    ):
        self.session = session
        self.gdata = gdata
        self.account = account

    async def get_bag_items(self) -> list[Item]:
        items = await self.session.item_bag()
        valid = [item for item in items if item.count > 0]
        return valid

    async def sell_items(self, items: list[Item]) -> tuple[list[Item], list[Item]]:
        sell_items, get_items = await self.session.item_sell(items)
        sold_count = len([row for row in sell_items if int(row.count) > 0])
        statistician.inc(OperationType.SELL, sold_count)
        gold_earned = self.get_gold_gain(get_items)
        self.account.adjust_coupon(gold_earned)
        return sell_items, get_items

    async def get_goods_list(self, shop_id: int = 2) -> list[GoodsInfo]:
        return await self.session.shop_info(shop_id)

    async def buy_goods(self, goods_id: int, num: int, price: int) -> list[Item]:
        get_items = await self.session.shop_buy_goods(
            goods_id=int(goods_id),
            num=int(num),
            price=int(price),
        )
        gold = -(price * num)
        self.account.adjust_coupon(gold)
        logger.info(
            "购买商品完成",
            goods_id=int(goods_id),
            num=int(num),
            total_cost=int(price) * int(num),
        )
        return get_items

    @staticmethod
    def is_available_goods(goods: GoodsInfo) -> bool:
        if not goods.unlocked:
            return False
        if goods.limit_count > 0 and goods.bought_num >= goods.limit_count:
            return False
        return True

    @staticmethod
    def get_gold_gain(items: list[Item]) -> int:
        return sum(item.count for item in items if item.id in {1, 1001})

    async def get_item_count(self, item_id: int) -> int:
        items = await self.get_bag_items()
        return sum(item.count for item in items if item.id == item_id)

    async def get_available_goods_list(self, shop_id: int = 2) -> list[GoodsInfo]:
        goods_list = await self.get_goods_list(shop_id)
        return [goods for goods in goods_list if self.is_available_goods(goods)]

    async def get_fruit_items(self, *, sellable_only: bool = False) -> list[Item]:
        bag_items = await self.get_bag_items()
        fruits = [item for item in bag_items if self.gdata.is_fruit_item(item.id)]
        if not sellable_only:
            return fruits
        return [item for item in fruits if item.count > 0 and item.uid > 0]

    async def sell_all_fruits(self) -> SellFruitsResult:
        to_sell = await self.get_fruit_items(sellable_only=True)

        if not to_sell:
            logger.debug("无可出售作物")
            return SellFruitsResult(message="没有可出售的作物")

        sold_items: list[Item] = []
        get_items: list[Item] = []
        fallback_used = False

        try:
            batch_sold, batch_get = await self.sell_items(to_sell)
            sold_items.extend(batch_sold)
            get_items.extend(batch_get)
        except Exception as e:
            fallback_used = True
            logger.warning(f"批量出售作物失败，降级逐个出售: {e}")
            for one in to_sell:
                try:
                    one_sold, one_get = await self.sell_items([one])
                    sold_items.extend(one_sold)
                    get_items.extend(one_get)
                except Exception as se:
                    logger.warning(
                        "单个作物出售失败，已跳过", item_id=one.id, error=str(se)
                    )
                    continue

        result = SellFruitsResult(
            sold_items=sold_items,
            get_items=get_items,
            sold_count=len({item.id for item in sold_items if item.count > 0}),
            gold_earned=self.get_gold_gain(get_items),
            message=("批量出售失败，已降级逐个出售" if fallback_used else "成功出售"),
        )
        logger.info(
            "出售全部作物完成",
            sold_count=result.sold_count,
            gold_earned=result.gold_earned,
            crop_names=self._collect_fruit_names(result.sold_items),
        )
        return result

    def _collect_fruit_names(self, items: list[Item]) -> list[str]:
        names: list[str] = []
        seen: set[str] = set()
        for item in items:
            if int(item.count) <= 0:
                continue
            name = self.gdata.get_fruit_name(int(item.id))
            if name in seen:
                continue
            seen.add(name)
            names.append(name)
        return names
