from __future__ import annotations

import time

from ..proto import OperationLimit
from .log_service import logger


class OperationLimitService:
    def __init__(self):
        self._limits_cache: dict[int, OperationLimit] = {}
        self._last_reset_day = ""

    def _check_reset(self):
        day = time.strftime("%Y-%m-%d", time.localtime())
        if day != self._last_reset_day:
            if self._limits_cache:
                logger.info("操作次数缓存跨天重置")
            self._limits_cache.clear()
            self._last_reset_day = day

    def get(self, operation_id: int):
        self._check_reset()
        return self._limits_cache.get(operation_id)

    def get_all(self):
        self._check_reset()
        return self._limits_cache

    def update(self, limits: list[OperationLimit]):
        self._check_reset()
        for limit in limits:
            self._limits_cache[limit.id] = limit
        if limits:
            logger.debug("操作次数限制已更新", count=len(limits))

    def can_operate(self, operation_id: int) -> bool:
        self._check_reset()
        limit = self._limits_cache.get(operation_id)
        if not limit:
            return True
        if limit.day_times_lt <= 0:
            return True
        return limit.day_times < limit.day_times_lt

    def can_get_exp(self, operation_id: int) -> bool:
        self._check_reset()
        limit = self._limits_cache.get(operation_id)
        if not limit:
            return False
        if limit.day_ex_times_lt <= 0:
            return True
        return limit.day_exp_times < limit.day_ex_times_lt

    def get_remaining_times(self, operation_id: int) -> int:
        self._check_reset()
        limit = self._limits_cache.get(operation_id)
        if not limit or limit.day_times_lt <= 0:
            return 999
        return max(0, limit.day_times_lt - limit.day_times)

