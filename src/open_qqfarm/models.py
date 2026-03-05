from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from typing import Any
from .proto import Item, BasicInfo, LandInfo


@dataclass
class UserState:
    uin: str = ""
    auth_code: str = ""
    basic: BasicInfo | None = None


class OperationId(IntEnum):
    HARVEST = 10001
    REMOVE = 10002
    PUT_WEED = 10003
    PUT_INSECT = 10004
    WEED = 10005
    INSECT = 10006
    WATER = 10007
    STEAL = 10008
    UNKNOWN = 0


class FertilizerId(IntEnum):
    NORMAL = 1011
    ORGANIC = 1012
    UNKNOWN = 0


class OperationType(str, Enum):
    WEED = "weed"
    INSECT = "insect"
    WATER = "water"
    HARVEST = "harvest"
    SELL = "sell"
    BUY_SEED = "buy_seed"
    REMOVE = "remove"
    UNLOCK = "unlock"
    UPGRADE = "upgrade"
    PLANT = "plant"
    NORMAL_FERTILIZE = "normal_fertilize"
    ORGANIC_FERTILIZE = "organic_fertilize"

    STEAL = "steal"
    HELP_WATER = "help_water"
    HELP_WEED = "help_weed"
    HELP_INSECT = "help_insect"
    PUT_INSECT = "put_insect"
    PUT_WEED = "put_weed"

    TASK_CLAIM = "task_claim"
    UNKNOWN = "unknown"

    def __str__(self) -> str:
        return self.to_zh()

    def to_zh(self) -> str:
        match self:
            case OperationType.WEED:
                return "除草"
            case OperationType.INSECT:
                return "抓虫"
            case OperationType.WATER:
                return "浇水"
            case OperationType.HARVEST:
                return "收获"
            case OperationType.SELL:
                return "卖果"
            case OperationType.BUY_SEED:
                return "购种"
            case OperationType.REMOVE:
                return "耕地"
            case OperationType.UNLOCK:
                return "解锁"
            case OperationType.UPGRADE:
                return "升级"
            case OperationType.PLANT:
                return "种植"
            case OperationType.NORMAL_FERTILIZE:
                return "施加普通化肥"
            case OperationType.ORGANIC_FERTILIZE:
                return "施加有机化肥"
            case OperationType.STEAL:
                return "偷菜"
            case OperationType.HELP_WATER:
                return "帮浇水"
            case OperationType.HELP_WEED:
                return "帮除草"
            case OperationType.HELP_INSECT:
                return "帮抓虫"
            case OperationType.PUT_INSECT:
                return "放虫"
            case OperationType.PUT_WEED:
                return "种草"
            case OperationType.TASK_CLAIM:
                return "任务领取"
            case _:
                return "未知操作"

    @classmethod
    def parse(cls, value: str | OperationType) -> OperationType | None:
        if isinstance(value, cls):
            return value
        try:
            return cls(str(value))
        except ValueError:
            return None

    @classmethod
    def from_operation_id(cls, operation_id: int) -> OperationType:
        try:
            op_id = OperationId(int(operation_id))
        except ValueError:
            return cls.UNKNOWN
        match op_id:
            case OperationId.HARVEST:
                return cls.HARVEST
            case OperationId.REMOVE:
                return cls.REMOVE
            case OperationId.PUT_WEED:
                return cls.PUT_WEED
            case OperationId.PUT_INSECT:
                return cls.PUT_INSECT
            case OperationId.WEED:
                return cls.WEED
            case OperationId.INSECT:
                return cls.INSECT
            case OperationId.WATER:
                return cls.WATER
            case OperationId.STEAL:
                return cls.STEAL
            case _:
                return cls.UNKNOWN

    def to_operation_id(self) -> int:
        match self:
            case OperationType.HARVEST:
                return OperationId.HARVEST
            case OperationType.REMOVE:
                return OperationId.REMOVE
            case OperationType.PUT_WEED:
                return OperationId.PUT_WEED
            case OperationType.PUT_INSECT:
                return OperationId.PUT_INSECT
            case OperationType.WEED | OperationType.HELP_WEED:
                return OperationId.WEED
            case OperationType.INSECT | OperationType.HELP_INSECT:
                return OperationId.INSECT
            case OperationType.WATER | OperationType.HELP_WATER:
                return OperationId.WATER
            case OperationType.STEAL:
                return OperationId.STEAL
            case _:
                return OperationId.UNKNOWN


class NotifyType(str, Enum):
    LANDS = "LandsNotify"
    ITEM = "ItemNotify"
    TASK_INFO = "TaskInfoNotify"
    FRIEND_APPLICATION_RECEIVED = "FriendApplicationReceivedNotify"
    BASIC = "BasicNotify"
    KICKOUT = "Kickout"

    @classmethod
    def parse(cls, value: str | NotifyType) -> NotifyType | None:
        if isinstance(value, cls):
            return value
        try:
            return cls(str(value))
        except ValueError:
            return None

    @classmethod
    def from_message_type(cls, message_type: str) -> NotifyType | None:
        text = str(message_type or "")
        for notify_type in cls:
            if notify_type.value in text:
                return notify_type
        return None


@dataclass(slots=True)
class LandAnalyzeResult:
    # 自家农场分析字段
    harvestable: list[int] = field(default_factory=list)
    growing: list[int] = field(default_factory=list)
    empty: list[int] = field(default_factory=list)
    dead: list[int] = field(default_factory=list)
    need_water: list[int] = field(default_factory=list)
    need_weed: list[int] = field(default_factory=list)
    need_insect: list[int] = field(default_factory=list)
    unlockable: list[int] = field(default_factory=list)
    upgradable: list[int] = field(default_factory=list)
    # 好友农场分析字段
    stealable: list[int] = field(default_factory=list)
    can_put_weed: list[int] = field(default_factory=list)
    can_put_insect: list[int] = field(default_factory=list)


@dataclass(slots=True)
class ActionResult:
    ok: bool = False
    op_type: OperationType = OperationType.UNKNOWN
    count: int = 0
    message: str = ""
    analyze: LandAnalyzeResult | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class FriendFarmContext:
    gid: int
    basic: BasicInfo
    lands: list[LandInfo]
    analyze: LandAnalyzeResult
    results: list[ActionResult] = field(default_factory=list)

    def add_result(self, result: ActionResult) -> None:
        self.results.append(result)


@dataclass(slots=True)
class SellFruitsResult:
    sold_items: list[Item] = field(default_factory=list)
    get_items: list[Item] = field(default_factory=list)
    sold_count: int = 0
    gold_earned: int = 0
    message: str = ""


class ScanStatus(Enum):
    WAIT = "wait"
    OK = "ok"
    USED = "used"
    ERROR = "error"


@dataclass(slots=True)
class ScanState:
    status: ScanStatus
    ticket: str = ""
    uin: str = ""
    auth_code: str = ""
    error: str = ""


@dataclass(slots=True)
class RuntimeState:
    running: bool = False
    connected: bool = False
    logging_in: bool = False
    auth_code_valid: bool = False
    network_available: bool = True
    started_at: float = 0.0

    @property
    def is_ready(self) -> bool:
        return (
            self.running
            and self.connected
            and self.auth_code_valid
        )

    def mark_started(self, started_at: float | None = None) -> None:
        self.running = True
        self.connected = False
        self.logging_in = False
        self.network_available = True
        self.started_at = time.time() if started_at is None else float(started_at)

    def mark_stopped(self) -> None:
        self.running = False
        self.connected = False
        self.logging_in = False
        self.network_available = True
        self.started_at = 0.0



@dataclass(slots=True)
class SeedInfo:
    seed_id: int
    name: str
    required_level: int
    price: int
    image: str


@dataclass(slots=True, frozen=True)
class ItemInfo:
    id: int
    type: int
    name: str
    interaction_type: str
    price_id: int
    price: int
    level: int
    target_id: int
    asset_name: str
    icon_res: str
    max_count: int
    max_own: int
    can_use: int
    desc: str
    effect_desc: str
    trait_id: int
    layer: int
    rarity: int
    rarity_color: str
    jumps: str
    ware_scale: Any | None = None

    @property
    def is_seed(self) -> bool:
        return self.type == 5

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ItemInfo":
        return cls(
            id=int(data["id"]),
            type=int(data["type"]),
            name=str(data["name"]),
            interaction_type=str(data["interaction_type"]),
            price_id=int(data["price_id"]),
            price=int(data["price"]),
            level=int(data["level"]),
            target_id=int(data["target_id"]),
            asset_name=str(data["asset_name"]),
            icon_res=str(data["icon_res"]),
            max_count=int(data["max_count"]),
            max_own=int(data["max_own"]),
            can_use=int(data["can_use"]),
            desc=str(data["desc"]),
            effect_desc=str(data.get("effectDesc", data.get("effect_desc", ""))),
            trait_id=int(data["trait_id"]),
            layer=int(data["layer"]),
            rarity=int(data["rarity"]),
            rarity_color=str(data["rarity_color"]),
            jumps=str(data["jumps"]),
            ware_scale=data.get("ware_scale"),
        )


@dataclass(slots=True, frozen=True)
class Plant:
    id: int
    name: str
    fruit_id: int
    fruit_count: int
    seed_id: int
    land_level_need: int
    seasons: int
    grow_phases: str
    exp: int
    grow_time_sec: int
    reduce_sec: int

    @property
    def is_farm_crop(self) -> bool:
        return str(self.id).startswith("102") and 20000 <= self.seed_id < 30000

    @property
    def is_two_season(self) -> bool:
        return self.seasons == 2

    @staticmethod
    def _parse_grow_time(grow_phases: str) -> int:
        return sum(int(seg.rsplit(":", 1)[1]) for seg in grow_phases.split(";") if seg)

    @staticmethod
    def _parse_reduce_sec(grow_phases: str) -> int:
        first = grow_phases.split(";", 1)[0]
        return int(first.rsplit(":", 1)[1])

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Plant":
        grow_phases = str(data["grow_phases"])
        return cls(
            id=int(data["id"]),
            name=str(data["name"]),
            seed_id=int(data["seed_id"]),
            land_level_need=int(data["land_level_need"]),
            exp=int(data["exp"]),
            seasons=int(data["seasons"]),
            grow_phases=grow_phases,
            fruit_id=int(data["fruit"]["id"]),
            fruit_count=int(data["fruit"]["count"]),
            grow_time_sec=cls._parse_grow_time(grow_phases),
            reduce_sec=cls._parse_reduce_sec(grow_phases),
        )


@dataclass(slots=True, frozen=True)
class TaskReward:
    id: int
    count: int


@dataclass(slots=True, frozen=True)
class TaskView:
    id: int
    desc: str
    progress: int
    total_progress: int
    is_claimed: bool
    is_unlocked: bool
    share_multiple: int
    rewards: list[TaskReward]
    can_claim: bool


@dataclass(slots=True)
class TaskClaimResult:
    task_claimed: int = 0
    active_claimed: int = 0
    task_items: list[TaskReward] = field(default_factory=list)
    active_items: list[TaskReward] = field(default_factory=list)


class SeedSelectionMode(str, Enum):
    PREFERRED_ID = "preferred_id"
    MAX_EXP = "max_exp"
    MAX_FERT_EXP = "max_fert_exp"
    MAX_PROFIT = "max_profit"
    MAX_FERT_PROFIT = "max_fert_profit"
    MAX_ITEM_ID = "max_item_id"

    @classmethod
    def parse(cls, value: str) -> SeedSelectionMode | None:
        try:
            return cls(value)
        except ValueError:
            return SeedSelectionMode.MAX_ITEM_ID
