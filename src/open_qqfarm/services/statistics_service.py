from __future__ import annotations

from ..models import OperationType
from .log_service import logger


class StatisticsService:
    def __init__(self) -> None:
        self.reset()
        logger.info("QQ 农场统计服务初始化完成")

    @staticmethod
    def _field_name(op_type: OperationType) -> str:
        return op_type.name.lower()

    def reset(self) -> None:
        for op_type in OperationType:
            setattr(self, self._field_name(op_type), 0)
        logger.debug("操作统计已重置")

    def inc(self, op_type: OperationType, delta: int = 1) -> int:
        amount = int(delta)
        if amount <= 0:
            return 0
        field = self._field_name(op_type)
        current = int(getattr(self, field, 0))
        setattr(self, field, current + amount)
        return amount

    def get(self, op_type: OperationType) -> int:
        return int(getattr(self, self._field_name(op_type), 0))

    def as_dict(self) -> dict[str, int]:
        return {
            self._field_name(op_type): int(getattr(self, self._field_name(op_type), 0))
            for op_type in OperationType
        }


statistician = StatisticsService()
