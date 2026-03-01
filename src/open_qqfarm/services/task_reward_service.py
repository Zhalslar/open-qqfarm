from __future__ import annotations

import asyncio

from ..models import OperationType, TaskClaimResult, TaskReward
from ..proto import Item, taskpb_pb2
from ..session import GatewayGameSession
from .log_service import logger
from .statistics_service import statistician


class TaskRewardService:
    def __init__(self, session: GatewayGameSession) -> None:
        self.session = session
        self._claim_lock = asyncio.Lock()

    @staticmethod
    def _format_items(items: list[Item]) -> list[TaskReward]:
        rows: list[TaskReward] = []
        for item in items:
            rows.append(TaskReward(id=item.id, count=item.count))
        return rows

    def _collect_claimable_tasks(
        self, info: taskpb_pb2.TaskInfo
    ) -> list[taskpb_pb2.Task]:
        rows: list[taskpb_pb2.Task] = []
        all_rows = list(info.growth_tasks) + list(info.daily_tasks) + list(info.tasks)
        for task in all_rows:
            progress = task.progress
            total = task.total_progress
            if (
                bool(task.is_unlocked)
                and (not bool(task.is_claimed))
                and total > 0
                and progress >= total
            ):
                rows.append(task)
        return rows

    async def _claim_actives(
        self, actives: list[taskpb_pb2.Active]
    ) -> tuple[int, list[TaskReward]]:
        claimed = 0
        item_rows: list[TaskReward] = []
        for active in actives:
            point_ids = [
                reward.point_id
                for reward in active.rewards
                if reward.status == taskpb_pb2.DONE and reward.point_id > 0
            ]
            if not point_ids:
                continue
            try:
                items = await self.session.task_claim_daily_reward(
                    active_type=active.type,
                    point_ids=point_ids,
                )
                claimed += len(point_ids)
                statistician.inc(OperationType.TASK_CLAIM, len(point_ids))
                item_rows.extend(self._format_items(items))
            except Exception as e:
                logger.warning("领取活跃奖励失败", active_type=active.type, error=str(e))
                continue
            await asyncio.sleep(0.2)
        return claimed, item_rows

    async def check_and_claim_tasks(self) -> TaskClaimResult:
        async with self._claim_lock:
            result = TaskClaimResult()
            info = await self.session.task_info()
            if info is None:
                result.task_claimed = 0
                logger.warning("任务信息为空，跳过领取")
                return result
            claimable = self._collect_claimable_tasks(info)
            if not claimable:
                logger.debug("无可领取的任务奖励")
                return result
            for task in claimable:
                shared = task.share_multiple > 1
                try:
                    items = await self.session.task_claim_reward(
                        task_id=task.id, do_shared=shared
                    )
                    result.task_claimed += 1
                    statistician.inc(OperationType.TASK_CLAIM, 1)
                    result.task_items.extend(self._format_items(items))
                except Exception as e:
                    logger.warning("领取任务奖励失败", task_id=task.id, error=str(e))
                    continue
                await asyncio.sleep(0.2)
            active_done, active_items = await self._claim_actives(info.actives)
            result.active_claimed = active_done
            result.active_items = active_items
            logger.info(
                "任务奖励领取完成",
                task_claimed=result.task_claimed,
                active_claimed=result.active_claimed,
            )
            return result
