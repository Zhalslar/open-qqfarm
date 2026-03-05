from types import SimpleNamespace

from open_qqfarm.services.account_service import AccountService
from open_qqfarm.services.warehouse_service import WarehouseService


def test_account_adjust_gold_updates_gold_not_coupon() -> None:
    account = AccountService.__new__(AccountService)
    account.gold = 100
    account.coupon = 7

    AccountService.adjust_gold(account, 25)
    assert account.gold == 125
    assert account.coupon == 7

    AccountService.adjust_gold(account, -40)
    assert account.gold == 85
    assert account.coupon == 7


def test_warehouse_buy_goods_adjusts_gold_balance() -> None:
    account = SimpleNamespace(gold=500)

    def _adjust_gold(delta: int) -> None:
        account.gold += int(delta)

    account.adjust_gold = _adjust_gold

    class DummySession:
        async def shop_buy_goods(self, goods_id: int, num: int, price: int):
            return []

    warehouse = WarehouseService(gdata=None, session=DummySession(), account=account)
    # 每个 30 金币，买 4 个，应减少 120 金币
    import asyncio

    asyncio.run(warehouse.buy_goods(goods_id=123, num=4, price=30))
    assert account.gold == 380

