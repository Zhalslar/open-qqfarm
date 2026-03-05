from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import random
from typing import Any, Awaitable, Callable

from ..config import CoreConfig
from ..models import ActionResult, OperationId, OperationType, LandAnalyzeResult
from ..proto import LandInfo, BasicInfo
from ..session import GatewayGameSession
from .friend_service import FriendService
from .land_service import LandService
from .log_service import logger
from .statistics_service import statistician
from .warehouse_service import WarehouseService


@dataclass
class FriendFarmAction:
    handler: Callable[[FriendFarmContext], Awaitable[ActionResult]]
    refresh: bool = False


@dataclass
class FriendFarmContext:
    gid: int
    basic: BasicInfo
    lands: list[LandInfo]
    analyze: LandAnalyzeResult

    _session: GatewayGameSession
    _land_service: LandService

    results: list[ActionResult] = field(default_factory=list)

    def add_result(self, result: ActionResult):
        self.results.append(result)

    async def refresh(self):
        basic, lands = await self._session.visit_enter_friend(self.gid)
        self.basic = basic
        self.lands = lands
        self.analyze = self._land_service.analyze_friend_lands(lands)


class FriendFarmService:
    def __init__(
        self,
        config: CoreConfig,
        session: GatewayGameSession,
        warehouse: WarehouseService,
        friend_service: FriendService,
        land_service: LandService,
    ) -> None:
        self.cfg = config.friend
        self.interval = config.step_interval
        self.session = session
        self.warehouse = warehouse
        self.friend_service = friend_service
        self.land = land_service

        self._lock = asyncio.Lock()

        self.action_map: dict[OperationType, FriendFarmAction] = {
            OperationType.STEAL: FriendFarmAction(self.do_steal),
            OperationType.HELP_WATER: FriendFarmAction(self.do_water, refresh=True),
            OperationType.HELP_WEED: FriendFarmAction(self.do_weed),
            OperationType.HELP_INSECT: FriendFarmAction(self.do_insect),
            OperationType.PUT_INSECT: FriendFarmAction(
                self.do_put_insect, refresh=True
            ),
            OperationType.PUT_WEED: FriendFarmAction(self.do_put_weed, refresh=True),
        }

    # =====================================================
    # 构建上下文（进入 + 分析）
    # =====================================================

    async def build_context(self, gid: int) -> FriendFarmContext | None:
        try:
            basic, lands = await self.session.visit_enter_friend(gid)
            analyze = self.land.analyze_friend_lands(lands)

            return FriendFarmContext(
                gid=gid,
                basic=basic,
                lands=lands,
                analyze=analyze,
                _session=self.session,
                _land_service=self.land,
            )
        except Exception as e:
            logger.warning("构建好友农场上下文失败", gid=gid, error=str(e))
            return None

    async def leave(self, gid: int):
        try:
            await self.session.visit_leave(gid)
        except Exception:
            pass

    # =====================================================
    # 外部入口
    # =====================================================

    async def run_single(self, gid: int, op: str | OperationType) -> ActionResult:
        async with self._lock:
            op_type = OperationType.parse(op)
            if not op_type:
                return ActionResult(message=f"未知操作: {op}")

            action = self.action_map.get(op_type)
            if not action:
                return ActionResult(message=f"未知操作: {op}")

            ctx = await self.build_context(gid)
            if not ctx:
                return ActionResult(message="进入好友农场失败")

            try:
                result = await action.handler(ctx)
                ctx.add_result(result)
                return result
            finally:
                await self.leave(gid)

    async def run_all(
        self,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> list[ActionResult]:
        results: list[ActionResult] = []

        friends = await self.friend_service.get_all_friends(cache=False)
        logger.info(f"开始执行好友全流程操作，共 {len(friends)} 人")

        action_queue: list[tuple[OperationType, FriendFarmAction]] = []
        for op in self.cfg.actions:
            op_type = OperationType.parse(op)
            if not op_type:
                continue
            action = self.action_map.get(op_type)
            if not action:
                continue
            action_queue.append((op_type, action))

        total_steps = len(friends) * len(action_queue)
        completed_steps = 0

        for friend in friends:
            gid = int(friend.gid)

            async with self._lock:
                ctx = await self.build_context(gid)
                if not ctx:
                    continue

                try:
                    for op_type, action in action_queue:

                        if action.refresh:
                            await ctx.refresh()

                        result = await action.handler(ctx)
                        ctx.add_result(result)
                        completed_steps += 1
                        if callable(on_progress):
                            try:
                                effect_count = max(0, int(result.count or 0))
                                on_progress(
                                    {
                                        "op": op_type.value,
                                        "gid": gid,
                                        "completed_steps": completed_steps,
                                        "total_steps": total_steps,
                                        "ok": bool(result.ok),
                                        "count": effect_count,
                                        "effective": bool(result.ok and effect_count > 0),
                                    }
                                )
                            except Exception:
                                pass

                        await asyncio.sleep(self.interval)

                finally:
                    await self.leave(gid)

            results.extend(ctx.results)

        logger.info("好友全流程执行完成")
        return results

    # =====================================================
    # 工具方法
    # =====================================================

    def _pick_targets_by_count(self, targets: list[int], raw_count: Any) -> list[int]:
        if not targets:
            return []

        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            count = len(targets)

        count = max(0, min(count, len(targets)))
        if count <= 0:
            return []

        return random.sample(targets, count)

    # =====================================================
    # 动作实现
    # =====================================================

    async def do_steal(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.STEAL)

        targets = list(ctx.analyze.stealable)
        if not targets:
            result.message = "无可偷作物"
            return result

        try:
            reply = await self.session.plant_check_can_operate(
                ctx.gid,
                operation_id=int(OperationId.STEAL),
            )
            if not reply.can_operate:
                result.message = "今日偷菜次数已用完"
                return result

            if reply.can_steal_num > 0:
                targets = targets[: reply.can_steal_num]

            lands = await self.session.plant_harvest(
                land_ids=targets,
                host_gid=ctx.gid,
                is_all=True,
            )

            count = len(lands)
            if count <= 0:
                result.message = "偷菜无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"偷菜完成 {count} 块"

            statistician.inc(OperationType.STEAL, count)

            sell = await self.warehouse.sell_all_fruits()
            if sell.sold_count > 0:
                result.message += f"，卖出{sell.sold_count}种作物"

            return result

        except Exception as e:
            result.message = f"偷菜失败: {e}"
            return result

    async def do_water(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.HELP_WATER)

        targets = list(ctx.analyze.need_water)
        if not targets:
            result.message = "无需要浇水土地"
            return result

        try:
            lands = await self.session.plant_water_land(
                land_ids=targets,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "浇水无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"浇水完成 {count} 块"

            statistician.inc(OperationType.HELP_WATER, count)
            return result

        except Exception as e:
            result.message = f"浇水失败: {e}"
            return result

    async def do_weed(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.HELP_WEED)

        targets = list(ctx.analyze.need_weed)
        if not targets:
            result.message = "无需要除草土地"
            return result

        try:
            lands = await self.session.plant_weed_out(
                land_ids=targets,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "除草无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"除草完成 {count} 块"

            statistician.inc(OperationType.HELP_WEED, count)
            return result

        except Exception as e:
            result.message = f"除草失败: {e}"
            return result

    async def do_insect(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.HELP_INSECT)

        targets = list(ctx.analyze.need_insect)
        if not targets:
            result.message = "无需要除虫土地"
            return result

        try:
            lands = await self.session.plant_insecticide(
                land_ids=targets,
                host_gid=ctx.gid,
            )

            count = len(lands)
            if count <= 0:
                result.message = "除虫无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"除虫完成 {count} 块"

            statistician.inc(OperationType.HELP_INSECT, count)
            return result

        except Exception as e:
            result.message = f"除虫失败: {e}"
            return result

    async def do_put_insect(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.PUT_INSECT)

        targets = self._pick_targets_by_count(
            list(ctx.analyze.can_put_insect),
            getattr(self.cfg, "put_insect_count", 1),
        )

        if not targets:
            result.message = "无可放虫土地"
            return result

        try:
            lands = await self.session.plant_put_insects(ctx.gid, land_ids=targets)

            count = len(lands)
            if count <= 0:
                result.message = "放虫无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"放虫完成 {count} 块"

            statistician.inc(OperationType.PUT_INSECT, count)
            return result

        except Exception as e:
            result.message = f"放虫失败: {e}"
            return result

    async def do_put_weed(self, ctx: FriendFarmContext) -> ActionResult:
        result = ActionResult(op_type=OperationType.PUT_WEED)

        targets = self._pick_targets_by_count(
            list(ctx.analyze.can_put_weed),
            getattr(self.cfg, "put_weed_count", 1),
        )

        if not targets:
            result.message = "无可种草土地"
            return result

        try:
            lands = await self.session.plant_put_weeds(ctx.gid, land_ids=targets)

            count = len(lands)
            if count <= 0:
                result.message = "种草无动作"
                return result

            result.ok = True
            result.count = count
            result.message = f"种草完成 {count} 块"

            statistician.inc(OperationType.PUT_WEED, count)
            return result

        except Exception as e:
            result.message = f"种草失败: {e}"
            return result
