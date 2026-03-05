from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from ..config import CoreConfig
from .game_data_service import GameDataService
from ..models import (
    ActionResult,
    FertilizerId,
    OperationType,
    SeedSelectionMode,
    LandAnalyzeResult,
)
from ..proto import GoodsInfo, LandInfo
from ..session import GatewayGameSession
from .account_service import AccountService
from .land_service import LandService
from .log_service import logger
from .statistics_service import statistician
from .warehouse_service import WarehouseService

@dataclass
class FarmAction:
    handler: Callable[[FarmContext], Awaitable[ActionResult]]
    refresh: bool = False

@dataclass
class FarmContext:
    gid: int
    lands: list[LandInfo]
    analyze: LandAnalyzeResult

    _session: GatewayGameSession
    _land_service: LandService

    results: list[ActionResult] = field(default_factory=list)

    def add_result(self, result: ActionResult):
        self.results.append(result)

    async def refresh(self):
        lands = await self._session.plant_all_lands(self.gid)
        self.lands = lands
        self.analyze = self._land_service.analyze_lands(lands)


class FarmService:
    def __init__(
        self,
        config: CoreConfig,
        gdata: GameDataService,
        account: AccountService,
        session: GatewayGameSession,
        warehouse: WarehouseService,
        land_service: LandService,
    ) -> None:
        self.cfg = config.farm
        self.interval = config.step_interval
        self.gdata = gdata
        self.account = account
        self.session = session
        self.warehouse = warehouse
        self.land = land_service

        self._lock = asyncio.Lock()

        self.action_map: dict[OperationType, FarmAction] = {
            OperationType.WEED: FarmAction(self.do_weed),
            OperationType.INSECT: FarmAction(self.do_insect),
            OperationType.WATER: FarmAction(self.do_water),
            OperationType.HARVEST: FarmAction(self.do_harvest, refresh=True),
            OperationType.SELL: FarmAction(self.do_sell),
            OperationType.BUY_SEED: FarmAction(self.do_buy_seed),
            OperationType.REMOVE: FarmAction(self.do_remove, refresh=True),
            OperationType.UNLOCK: FarmAction(self.do_unlock, refresh=True),
            OperationType.UPGRADE: FarmAction(self.do_upgrade, refresh=True),
            OperationType.PLANT: FarmAction(self.do_plant, refresh=True),
            OperationType.NORMAL_FERTILIZE: FarmAction(self.do_normal_fertilize),
            OperationType.ORGANIC_FERTILIZE: FarmAction(self.do_organic_fertilize),
        }

    # =====================================================
    # 构建上下文
    # =====================================================

    async def _build_context(self) -> FarmContext | None:
        try:
            lands = await self.session.plant_all_lands(self.account.gid)
            analyze = self.land.analyze_lands(lands)

            return FarmContext(
                gid=self.account.gid,
                lands=lands,
                analyze=analyze,
                _session=self.session,
                _land_service=self.land,
            )
        except Exception as e:
            logger.error("构建农场上下文失败", error=str(e))
            return None

    # =====================================================
    # 外部入口
    # =====================================================

    async def run_single(self, op: str | OperationType) -> ActionResult:
        async with self._lock:
            op_type = OperationType.parse(op)
            if not op_type:
                return ActionResult(message=f"未知操作: {op}")

            action = self.action_map.get(op_type)
            if not action:
                return ActionResult(message=f"未知操作: {op}")

            ctx = await self._build_context()
            if not ctx:
                return ActionResult(message="获取农田信息失败")

            result = await action.handler(ctx)
            ctx.add_result(result)

            return result

    async def run_all(
        self,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> list[ActionResult]:
        logger.info("开始执行农场全流程操作")

        async with self._lock:
            ctx = await self._build_context()
            if not ctx:
                return []

            queue: list[tuple[OperationType, FarmAction]] = []
            for op in self.cfg.actions:
                op_type = OperationType.parse(op)
                if not op_type:
                    continue
                action = self.action_map.get(op_type)
                if not action:
                    continue
                queue.append((op_type, action))

            total_steps = len(queue)
            for index, (op_type, action) in enumerate(queue):

                if action.refresh:
                    await ctx.refresh()

                result = await action.handler(ctx)
                ctx.add_result(result)
                if callable(on_progress):
                    try:
                        effect_count = max(0, int(result.count or 0))
                        on_progress(
                            {
                                "op": op_type.value,
                                "index": index,
                                "completed_steps": index + 1,
                                "total_steps": total_steps,
                                "ok": bool(result.ok),
                                "count": effect_count,
                                "effective": bool(result.ok and effect_count > 0),
                                "extra": dict(result.extra or {}),
                            }
                        )
                    except Exception:
                        pass

                await asyncio.sleep(self.interval)

        return ctx.results

    # =====================================================
    # 动作实现
    # =====================================================

    async def do_weed(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.WEED)

        if not ctx.analyze.need_weed:
            result.message = "无杂草需要清除"
            return result

        try:
            lands = await self.session.plant_weed_out(
                land_ids=ctx.analyze.need_weed,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "无杂草需要清除"
                return result

            result.ok = True
            result.count = count
            result.message = f"除草完成 {count} 块"
            statistician.inc(OperationType.WEED, count)

        except Exception as e:
            result.message = f"除草失败: {e}"

        return result

    async def do_insect(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.INSECT)

        if not ctx.analyze.need_insect:
            result.message = "无害虫需要清除"
            return result

        try:
            lands = await self.session.plant_insecticide(
                land_ids=ctx.analyze.need_insect,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "无害虫需要清除"
                return result

            result.ok = True
            result.count = count
            result.message = f"除虫完成 {count} 块"
            statistician.inc(OperationType.INSECT, count)

        except Exception as e:
            result.message = f"除虫失败: {e}"

        return result

    async def do_water(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.WATER)

        if not ctx.analyze.need_water:
            result.message = "无作物需要浇水"
            return result

        try:
            lands = await self.session.plant_water_land(
                land_ids=ctx.analyze.need_water,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "无作物需要浇水"
                return result

            result.ok = True
            result.count = count
            result.message = f"浇水完成 {count} 块"
            statistician.inc(OperationType.WATER, count)

        except Exception as e:
            result.message = f"浇水失败: {e}"

        return result

    async def do_harvest(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.HARVEST)

        if not ctx.analyze.harvestable:
            result.message = "无可收获作物"
            return result

        try:
            lands = await self.session.plant_harvest(
                land_ids=ctx.analyze.harvestable,
                host_gid=ctx.gid,
                is_all=True,
            )

            count = len(lands)
            if count <= 0:
                result.message = "无可收获作物"
                return result

            result.ok = True
            result.count = count
            result.message = f"收获完成 {count} 块"
            statistician.inc(OperationType.HARVEST, count)

        except Exception as e:
            result.message = f"收获失败: {e}"

        return result

    async def do_sell(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.SELL)

        try:
            sell = await self.warehouse.sell_all_fruits()

            if sell.sold_count <= 0:
                result.message = sell.message or "仓库无可出售作物"
                return result

            result.ok = True
            result.count = int(sell.sold_count)
            result.message = (
                f"出售完成 {sell.sold_count} 种作物，赚取{sell.gold_earned}金币"
            )

        except Exception as e:
            result.message = f"出售失败: {e}"

        return result

    async def do_buy_seed(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.BUY_SEED)

        if not ctx.analyze.empty:
            result.message = "当前无空地，无需购种"
            return result

        seed = await self.choose_seed()
        if not seed:
            result.message = "没有可购种子"
            return result

        plan_lands, buy_message, buy_extra = await self._prepare_seed_and_buy(
            seed,
            ctx.analyze.empty,
        )
        seed_name = self.gdata.get_plant_name_by_seed(seed.item_id)
        bought_count = max(0, int(buy_extra.get("count", 0) or 0))
        if bought_count > 0:
            result.ok = True
            result.count = bought_count
            result.message = buy_message or f"购种完成 {bought_count} 个 {seed_name} 种子"
            result.extra = {
                "goods_id": max(0, int(buy_extra.get("goods_id", 0) or 0)),
                "item_id": max(0, int(buy_extra.get("item_id", 0) or 0)),
            }
            statistician.inc(OperationType.BUY_SEED, bought_count)
            return result

        if len(plan_lands) >= len(ctx.analyze.empty):
            result.message = "背包种子充足，无需购种"
            return result

        result.message = buy_message or f"{seed_name} 种子库存不足"
        return result

    async def do_remove(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.REMOVE)

        if not ctx.analyze.dead:
            result.message = "无枯萎作物需要清理"
            return result

        try:
            lands = await self.session.plant_remove(ctx.analyze.dead)

            count = len(lands)
            if count <= 0:
                result.message = "无枯萎作物需要清理"
                return result

            result.ok = True
            result.count = count
            result.message = f"清理完成 {count} 块"
            statistician.inc(OperationType.REMOVE, count)

        except Exception as e:
            result.message = f"清理失败: {e}"

        return result

    async def do_unlock(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.UNLOCK)

        unlocked = 0
        failed: list[str] = []

        for land_id in ctx.analyze.unlockable:
            try:
                await self.session.plant_unlock_land(land_id, do_shared=False)
                unlocked += 1
            except Exception as e:
                failed.append(f"#{land_id}:{e}")
            await asyncio.sleep(0.2)

        result.count = unlocked
        result.extra = {"failed": failed}

        if unlocked <= 0:
            result.message = "当前无可解锁地块"
            return result

        result.ok = True
        result.message = f"解锁完成 {unlocked} 块"
        statistician.inc(OperationType.UNLOCK, unlocked)
        return result

    async def do_upgrade(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.UPGRADE)

        upgraded = 0
        failed: list[str] = []

        for land_id in ctx.analyze.upgradable:
            try:
                await self.session.plant_upgrade_land(land_id)
                upgraded += 1
            except Exception as e:
                failed.append(f"#{land_id}:{e}")
            await asyncio.sleep(0.2)

        result.count = upgraded
        result.extra = {"failed": failed}

        if upgraded <= 0:
            result.message = "当前无可升级地块"
            return result

        result.ok = True
        result.message = f"升级完成 {upgraded} 块"
        statistician.inc(OperationType.UPGRADE, upgraded)
        return result

    async def do_plant(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.PLANT)

        if not ctx.analyze.empty:
            result.message = "农田中无空地可种植"
            return result

        seed = await self.choose_seed()
        if not seed:
            result.message = "没有可用种子"
            return result

        result.extra = {"item_id": int(seed.item_id)}
        seed_name = self.gdata.get_plant_name_by_seed(seed.item_id)
        stock = await self.warehouse.get_item_count(seed.item_id)
        if stock <= 0:
            result.message = f"{seed_name} 种子库存不足，请先执行购种"
            return result

        need = len(ctx.analyze.empty)
        plan_lands = ctx.analyze.empty[:stock]
        if not plan_lands:
            result.message = f"{seed_name} 种子库存不足，请先执行购种"
            return result

        try:
            planted = await self.session.plant_seed(
                seed_id=seed.item_id,
                land_ids=plan_lands,
                direct_traverse=True,
            )

            count = len(planted)
            if count <= 0:
                result.message = "种植失败"
                return result

            result.ok = True
            result.count = count
            result.message = f"成功种下 {count} 颗 {seed_name} 种子"
            if count < need:
                result.message = (
                    f"{result.message}，库存不足，剩余 {max(0, need - count)} 块空地"
                )

            statistician.inc(OperationType.PLANT, count)

        except Exception as e:
            result.message = f"种植失败: {e}"

        return result

    async def do_normal_fertilize(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.NORMAL_FERTILIZE)

        if not ctx.analyze.growing:
            result.message = "无作物需要施肥"
            return result

        count = len(ctx.analyze.growing)

        try:
            await self.session.plant_fertilize(
                land_ids=ctx.analyze.growing,
                fertilizer_id=int(FertilizerId.NORMAL),
            )

            result.ok = True
            result.count = count
            result.message = f"给 {count} 株作物施了普通化肥"

            statistician.inc(OperationType.NORMAL_FERTILIZE, count)

        except Exception as e:
            result.message = f"普通化肥施加失败: {e}"

        return result

    async def do_organic_fertilize(self, ctx: FarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.ORGANIC_FERTILIZE)

        if not ctx.analyze.growing:
            result.message = "无作物需要施肥"
            return result

        count = len(ctx.analyze.growing)

        try:
            await self.session.plant_fertilize(
                land_ids=ctx.analyze.growing,
                fertilizer_id=int(FertilizerId.ORGANIC),
            )

            result.ok = True
            result.count = count
            result.message = f"给 {count} 株作物施了有机化肥"

            statistician.inc(OperationType.ORGANIC_FERTILIZE, count)

        except Exception as e:
            result.message = f"有机化肥施加失败: {e}"

        return result

    def _parse_good_metrics(
        self, goods: GoodsInfo
    ) -> tuple[int, float, int, int] | None:
        """
        计算种子商品的核心收益指标。

        返回:
            harvest_exp : 单次完整收获经验（双季翻倍）
            net_profit  : 单次种植净收益 = 总产出价值 - 单个种子成本
            grow_time   : 完整生长时间（秒，双季 ×1.5）
            fert_time   : 施肥后生长时间（秒，最小为 1）

        若植物配置不存在或 grow_time 非法，则返回 None。
        """
        plant = self.gdata.get_plant_by_seed(goods.item_id)
        if not plant:
            return None

        is_two = plant.is_two_season

        grow_time = int(plant.grow_time_sec * 1.5) if is_two else plant.grow_time_sec
        if grow_time <= 0:
            return None

        harvest_exp = plant.exp * 2 if is_two else plant.exp
        reduce_sec_applied = plant.reduce_sec * 2 if is_two else plant.reduce_sec
        fert_time = max(1, grow_time - reduce_sec_applied)

        unit_seed_price = goods.price / goods.item_count
        fruit_price = self.gdata.get_fruit_price(plant.fruit_id)
        income = plant.fruit_count * fruit_price * (2 if is_two else 1)
        net_profit = income - unit_seed_price

        return harvest_exp, net_profit, grow_time, fert_time

    async def choose_seed(self) -> GoodsInfo | None:
        goods_list = await self.warehouse.get_available_goods_list()
        if not goods_list:
            return None

        mode = SeedSelectionMode.parse(self.cfg.seed_mode)
        if mode is None:
            mode = SeedSelectionMode.MAX_ITEM_ID
        logger.debug("开始选种", mode=str(mode))

        match mode:
            case SeedSelectionMode.PREFERRED_ID:
                for goods in goods_list:
                    if goods.item_id == self.cfg.preferred_seed_id:
                        logger.debug(
                            "命中指定种子",
                            seed_id=goods.item_id,
                            seed_name=self.gdata.get_plant_name_by_seed(goods.item_id),
                        )
                        return goods
                return None
            case (
                SeedSelectionMode.MAX_EXP
                | SeedSelectionMode.MAX_FERT_EXP
                | SeedSelectionMode.MAX_PROFIT
                | SeedSelectionMode.MAX_FERT_PROFIT
            ):
                scored: list[tuple[float, float, int, int, GoodsInfo]] = []

                for goods in goods_list:
                    metrics = self._parse_good_metrics(goods)
                    if not metrics:
                        continue

                    harvest_exp, net_profit, grow_time, fert_time = metrics

                    match mode:
                        case SeedSelectionMode.MAX_EXP:
                            score = (harvest_exp / grow_time) * 3600
                        case SeedSelectionMode.MAX_FERT_EXP:
                            score = (harvest_exp / fert_time) * 3600
                        case SeedSelectionMode.MAX_PROFIT:
                            score = (net_profit / grow_time) * 3600
                        case SeedSelectionMode.MAX_FERT_PROFIT:
                            score = (net_profit / fert_time) * 3600

                    unit_seed_price = goods.price / goods.item_count

                    scored.append(
                        (
                            score,
                            -unit_seed_price,  # 单价低优先
                            -goods.item_id,  # item_id 大优先
                            -goods.id,  # id 大优先
                            goods,
                        )
                    )

                if scored:
                    selected = max(scored, key=lambda row: row[:4])[4]
                    logger.debug(
                        "选种完成：按收益模式选择",
                        seed_id=selected.item_id,
                        seed_name=self.gdata.get_plant_name_by_seed(selected.item_id),
                    )
                    return selected

                selected = max(goods_list, key=lambda goods: (goods.item_id, goods.id))
                logger.debug(
                    "选种回退：按item_id最大值选择",
                    seed_id=selected.item_id,
                    seed_name=self.gdata.get_plant_name_by_seed(selected.item_id),
                )
                return selected

            case SeedSelectionMode.MAX_ITEM_ID:
                selected = max(goods_list, key=lambda goods: (goods.item_id, goods.id))
                logger.debug(
                    "选种完成：按item_id最大值",
                    seed_id=selected.item_id,
                    seed_name=self.gdata.get_plant_name_by_seed(selected.item_id),
                )
                return selected

    async def _prepare_seed_and_buy(
        self,
        seed: GoodsInfo,
        land_ids: list[int],
    ) -> tuple[list[int], str, dict[str, int]]:
        if not land_ids:
            return [], "", {}

        stock = await self.warehouse.get_item_count(seed.item_id)
        need = len(land_ids)
        seed_name = self.gdata.get_plant_name_by_seed(seed.item_id)

        # 当前库存够用
        if stock >= need:
            return land_ids, "", {}

        # 计算最多能买多少份
        max_buy = self.account.gold // seed.price
        if max_buy <= 0:
            logger.warning(
                "金币不足，无法购买种子",
                seed_id=seed.item_id,
                seed_name=seed_name,
                need=need,
                stock=stock,
            )
            return land_ids[:stock], f"背包种子{seed.item_id}库存不足", {}

        # 需要买多少份才能补足
        missing = need - stock
        buy = min(max_buy, (missing + seed.item_count - 1) // seed.item_count)

        bought = 0
        msg = ""

        try:
            get_items = await self.warehouse.buy_goods(
                goods_id=seed.id,
                num=buy,
                price=seed.price,
            )
            for item in get_items:
                if item.id == seed.item_id:
                    bought += item.count
        except Exception as e:
            msg = f"购买种子失败: {e}"
            logger.warning(
                "购买种子失败",
                seed_id=seed.item_id,
                seed_name=seed_name,
                error=str(e),
            )

        total = stock + bought
        if total <= 0:
            return [], msg or f"背包种子{seed.item_id}库存不足", {}

        buy_extra: dict[str, int] = {}
        if bought > 0 and not msg:
            msg = f"购买{bought}个种子"
            buy_extra = {
                "goods_id": int(seed.id),
                "item_id": int(seed.item_id),
                "count": int(bought),
            }

        return land_ids[: min(need, total)], msg, buy_extra
