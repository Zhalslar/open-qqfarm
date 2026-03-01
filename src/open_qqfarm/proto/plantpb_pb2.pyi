from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

class LandInfo(_Message):
    id: int
    unlocked: bool
    level: int
    max_level: int
    could_unlock: bool
    could_upgrade: bool
    unlock_condition: LandUnlockCondition
    upgrade_condition: LandUpgradeCondition
    buff: LandInfo.Buff
    plant: PlantInfo
    is_shared: bool
    can_share: bool
    master_land_id: int
    slave_land_ids: list[int]
    land_size: int
    lands_level: int
    def __init__(
        self,
        *,
        id: int = ...,
        unlocked: bool = ...,
        level: int = ...,
        max_level: int = ...,
        could_unlock: bool = ...,
        could_upgrade: bool = ...,
        unlock_condition: LandUnlockCondition | Mapping[str, Any] | None = ...,
        upgrade_condition: LandUpgradeCondition | Mapping[str, Any] | None = ...,
        buff: LandInfo.Buff | Mapping[str, Any] | None = ...,
        plant: PlantInfo | Mapping[str, Any] | None = ...,
        is_shared: bool = ...,
        can_share: bool = ...,
        master_land_id: int = ...,
        slave_land_ids: Iterable[int] | None = ...,
        land_size: int = ...,
        lands_level: int = ...,
    ) -> None: ...

class LandUnlockCondition(_Message):
    need_level: int
    need_gold: int
    def __init__(
        self,
        *,
        need_level: int = ...,
        need_gold: int = ...,
    ) -> None: ...

class LandUpgradeCondition(_Message):
    need_level: int
    need_gold: int
    def __init__(
        self,
        *,
        need_level: int = ...,
        need_gold: int = ...,
    ) -> None: ...

class PlantInfo(_Message):
    id: int
    name: str
    phases: list[PlantPhaseInfo]
    season: int
    dry_num: int
    stole_num: int
    fruit_id: int
    fruit_num: int
    weed_owners: list[int]
    insect_owners: list[int]
    stealers: list[int]
    grow_sec: int
    stealable: bool
    left_inorc_fert_times: int
    left_fruit_num: int
    steal_intimacy_level: int
    mutant_config_ids: list[int]
    is_nudged: bool
    def __init__(
        self,
        *,
        id: int = ...,
        name: str = ...,
        phases: Iterable[PlantPhaseInfo | Mapping[str, Any]] | None = ...,
        season: int = ...,
        dry_num: int = ...,
        stole_num: int = ...,
        fruit_id: int = ...,
        fruit_num: int = ...,
        weed_owners: Iterable[int] | None = ...,
        insect_owners: Iterable[int] | None = ...,
        stealers: Iterable[int] | None = ...,
        grow_sec: int = ...,
        stealable: bool = ...,
        left_inorc_fert_times: int = ...,
        left_fruit_num: int = ...,
        steal_intimacy_level: int = ...,
        mutant_config_ids: Iterable[int] | None = ...,
        is_nudged: bool = ...,
    ) -> None: ...

class PlantPhaseInfo(_Message):
    phase: int
    begin_time: int
    phase_id: int
    dry_time: int
    weeds_time: int
    insect_time: int
    ferts_used: dict[int, int]
    mutants: list[MutantInfo]
    def __init__(
        self,
        *,
        phase: int = ...,
        begin_time: int = ...,
        phase_id: int = ...,
        dry_time: int = ...,
        weeds_time: int = ...,
        insect_time: int = ...,
        ferts_used: Mapping[int, int] | None = ...,
        mutants: Iterable[MutantInfo | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class MutantInfo(_Message):
    mutant_time: int
    mutant_config_id: int
    weather_id: int
    def __init__(
        self,
        *,
        mutant_time: int = ...,
        mutant_config_id: int = ...,
        weather_id: int = ...,
    ) -> None: ...

class OperationLimit(_Message):
    id: int
    day_times: int
    day_times_lt: int
    day_share_id: int
    day_exp_times: int
    day_ex_times_lt: int
    day_exp_share_id: int
    def __init__(
        self,
        *,
        id: int = ...,
        day_times: int = ...,
        day_times_lt: int = ...,
        day_share_id: int = ...,
        day_exp_times: int = ...,
        day_ex_times_lt: int = ...,
        day_exp_share_id: int = ...,
    ) -> None: ...

class AllLandsRequest(_Message):
    host_gid: int
    def __init__(
        self,
        *,
        host_gid: int = ...,
    ) -> None: ...

class AllLandsReply(_Message):
    lands: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        lands: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class HarvestRequest(_Message):
    land_ids: list[int]
    host_gid: int
    is_all: bool
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
        host_gid: int = ...,
        is_all: bool = ...,
    ) -> None: ...

class HarvestReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class WaterLandRequest(_Message):
    land_ids: list[int]
    host_gid: int
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
        host_gid: int = ...,
    ) -> None: ...

class WaterLandReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class WeedOutRequest(_Message):
    land_ids: list[int]
    host_gid: int
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
        host_gid: int = ...,
    ) -> None: ...

class WeedOutReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class InsecticideRequest(_Message):
    land_ids: list[int]
    host_gid: int
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
        host_gid: int = ...,
    ) -> None: ...

class InsecticideReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class PlantItem(_Message):
    seed_id: int
    land_ids: list[int]
    auto_slave: bool
    def __init__(
        self,
        *,
        seed_id: int = ...,
        land_ids: Iterable[int] | None = ...,
        auto_slave: bool = ...,
    ) -> None: ...

class PlantRequest(_Message):
    land_and_seed: dict[int, int]
    items: list[PlantItem]
    def __init__(
        self,
        *,
        land_and_seed: Mapping[int, int] | None = ...,
        items: Iterable[PlantItem | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class PlantReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class RemovePlantRequest(_Message):
    land_ids: list[int]
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
    ) -> None: ...

class RemovePlantReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class FertilizeRequest(_Message):
    land_ids: list[int]
    fertilizer_id: int
    def __init__(
        self,
        *,
        land_ids: Iterable[int] | None = ...,
        fertilizer_id: int = ...,
    ) -> None: ...

class FertilizeReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    fertilizer: int
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
        fertilizer: int = ...,
    ) -> None: ...

class PutInsectsRequest(_Message):
    host_gid: int
    land_ids: list[int]
    def __init__(
        self,
        *,
        host_gid: int = ...,
        land_ids: Iterable[int] | None = ...,
    ) -> None: ...

class PutInsectsReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class PutWeedsRequest(_Message):
    host_gid: int
    land_ids: list[int]
    def __init__(
        self,
        *,
        host_gid: int = ...,
        land_ids: Iterable[int] | None = ...,
    ) -> None: ...

class PutWeedsReply(_Message):
    land: list[LandInfo]
    operation_limits: list[OperationLimit]
    def __init__(
        self,
        *,
        land: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        operation_limits: Iterable[OperationLimit | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class UpgradeLandRequest(_Message):
    land_id: int
    def __init__(
        self,
        *,
        land_id: int = ...,
    ) -> None: ...

class UpgradeLandReply(_Message):
    land: LandInfo
    def __init__(
        self,
        *,
        land: LandInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

class UnlockLandRequest(_Message):
    land_id: int
    do_shared: bool
    def __init__(
        self,
        *,
        land_id: int = ...,
        do_shared: bool = ...,
    ) -> None: ...

class UnlockLandReply(_Message):
    land: LandInfo
    def __init__(
        self,
        *,
        land: LandInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

class CheckCanOperateRequest(_Message):
    host_gid: int
    operation_id: int
    def __init__(
        self,
        *,
        host_gid: int = ...,
        operation_id: int = ...,
    ) -> None: ...

class CheckCanOperateReply(_Message):
    can_operate: bool
    can_steal_num: int
    def __init__(
        self,
        *,
        can_operate: bool = ...,
        can_steal_num: int = ...,
    ) -> None: ...

class LandsNotify(_Message):
    lands: list[LandInfo]
    host_gid: int
    def __init__(
        self,
        *,
        lands: Iterable[LandInfo | Mapping[str, Any]] | None = ...,
        host_gid: int = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
