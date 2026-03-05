from __future__ import annotations

import time
from typing import Any

from ..models import LandAnalyzeResult
from ..proto import plantpb_pb2
from .game_data_service import GameDataService
from .account_service import AccountService

def to_time_sec(n: int) -> int:
    if n <= 0:
        return 0
    if n > 1_000_000_000_000:
        return n // 1000
    return n


class LandService:
    def __init__(
        self, account: AccountService, gdata: GameDataService | None = None
    ) -> None:
        self.account = account
        self.gdata = gdata
        self.cache_ttl_sec = 2.0
        self._lands_cache: dict[tuple[str, int], dict[str, Any]] = {}

    @staticmethod
    def _cache_key(host_gid: int, friend: bool) -> tuple[str, int]:
        return ("friend" if friend else "self", int(host_gid))

    def _is_cache_fresh(self, fetched_at: float) -> bool:
        if self.cache_ttl_sec <= 0:
            return False
        return (time.time() - float(fetched_at)) <= self.cache_ttl_sec

    def set_cache_ttl(self, ttl_sec: float) -> None:
        self.cache_ttl_sec = max(0.0, float(ttl_sec))

    def invalidate_cache(
        self,
        *,
        host_gid: int | None = None,
        friend: bool | None = None,
    ) -> None:
        if host_gid is None and friend is None:
            self._lands_cache.clear()
            return

        target_gid = int(host_gid) if host_gid is not None else None
        mode = None if friend is None else ("friend" if friend else "self")
        drop_keys = [
            key
            for key in self._lands_cache
            if (target_gid is None or key[1] == target_gid)
            and (mode is None or key[0] == mode)
        ]
        for key in drop_keys:
            self._lands_cache.pop(key, None)

    def _get_cached_entry(
        self,
        *,
        host_gid: int,
        friend: bool,
    ) -> dict[str, Any] | None:
        key = self._cache_key(host_gid, friend)
        entry = self._lands_cache.get(key)
        if not entry:
            return None
        if not self._is_cache_fresh(entry.get("fetched_at", 0.0)):
            self._lands_cache.pop(key, None)
            return None
        return entry

    def _store_cache_entry(
        self,
        *,
        host_gid: int,
        friend: bool,
        lands: list[plantpb_pb2.LandInfo],
        basic: Any = None,
    ) -> None:
        key = self._cache_key(host_gid, friend)
        self._lands_cache[key] = {
            "fetched_at": time.time(),
            "basic": basic,
            "lands": list(lands),
            "analyze": (
                self.analyze_friend_lands(lands)
                if friend
                else self.analyze_lands(lands)
            ),
        }

    async def get_all_lands(
        self,
        session: Any,
        host_gid: int,
        *,
        cache: bool = True,
    ) -> list[plantpb_pb2.LandInfo]:
        if cache:
            entry = self._get_cached_entry(host_gid=host_gid, friend=False)
            if entry is not None:
                return list(entry.get("lands", []))

        lands = await session.plant_all_lands(int(host_gid))
        self._store_cache_entry(host_gid=host_gid, friend=False, lands=lands)
        return list(lands)

    async def get_friend_lands(
        self,
        session: Any,
        host_gid: int,
        *,
        cache: bool = True,
    ) -> tuple[Any, list[plantpb_pb2.LandInfo]]:
        if cache:
            entry = self._get_cached_entry(host_gid=host_gid, friend=True)
            if entry is not None:
                return entry.get("basic"), list(entry.get("lands", []))

        basic, lands = await session.visit_enter_friend(int(host_gid))
        self._store_cache_entry(
            host_gid=host_gid,
            friend=True,
            lands=lands,
            basic=basic,
        )
        return basic, list(lands)

    def get_cached_analyze(
        self,
        *,
        host_gid: int,
        friend: bool = False,
    ) -> LandAnalyzeResult | None:
        entry = self._get_cached_entry(host_gid=host_gid, friend=friend)
        if entry is None:
            return None
        analyze = entry.get("analyze")
        if not isinstance(analyze, LandAnalyzeResult):
            return None
        return analyze

    def collect_crop_names(self, lands: list[plantpb_pb2.LandInfo]) -> list[str]:
        names: list[str] = []
        seen: set[str] = set()
        for land in lands:
            if not land.HasField("plant"):
                continue
            plant = land.plant
            name = str(getattr(plant, "name", "")).strip()
            if not name and self.gdata is not None and int(getattr(plant, "id", 0)) > 0:
                name = self.gdata.get_plant_name(int(plant.id))
            if not name:
                pid = int(getattr(plant, "id", 0))
                if pid > 0:
                    name = f"植物{pid}"
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
        return names

    async def collect_crop_names_by_land_ids(
        self,
        session: Any,
        host_gid: int,
        land_ids: list[int],
    ) -> list[str]:
        target_ids = {int(v) for v in land_ids if int(v) > 0}
        if not target_ids:
            return []
        lands = await self.get_all_lands(session, int(host_gid), cache=True)
        target_lands = [land for land in lands if int(land.id) in target_ids]
        return self.collect_crop_names(target_lands)

    @staticmethod
    def _resolve_current_phase(
        plant: plantpb_pb2.PlantInfo, now_sec: int
    ) -> plantpb_pb2.PlantPhaseInfo:
        """在所有阶段里选出“当前时间已开始且最接近当前时间”的阶段"""
        phase = plant.phases[0]
        phase_begin = -1
        for phase_info in plant.phases:
            begin = to_time_sec(phase_info.begin_time)
            if begin <= 0:
                continue
            if begin <= now_sec and begin >= phase_begin:
                phase = phase_info
                phase_begin = begin
        return phase

    def analyze_lands(
        self,
        lands: list[plantpb_pb2.LandInfo],
        *,
        now_sec: int | None = None,
    ) -> LandAnalyzeResult:
        """自家农场分析：用于收获、浇水、除草、除虫、解锁、升级等决策"""
        now = int(now_sec or time.time())
        result = LandAnalyzeResult()

        for land in lands:
            # 未解锁地块只判断是否可解锁
            if not land.unlocked:
                if bool(land.could_unlock):
                    result.unlockable.append(land.id)
                continue

            # 已解锁地块判断是否可升级
            if bool(land.could_upgrade):
                result.upgradable.append(land.id)

            # 没有作物则归为空地
            if not land.HasField("plant") or not land.plant.phases:
                result.empty.append(land.id)
                continue

            plant = land.plant
            phase = self._resolve_current_phase(plant, now)
            phase_val = int(phase.phase)
            phase_dry_time = to_time_sec(phase.dry_time)
            phase_weed_time = to_time_sec(phase.weeds_time)
            phase_insect_time = to_time_sec(phase.insect_time)

            # 同时参考实时计数和阶段时间，尽量覆盖不同服务端返回形态
            need_w = int(plant.dry_num) > 0 or (
                phase_dry_time > 0 and phase_dry_time <= now
            )
            need_g = bool(plant.weed_owners) or (
                phase_weed_time > 0 and phase_weed_time <= now
            )
            need_b = bool(plant.insect_owners) or (
                phase_insect_time > 0 and phase_insect_time <= now
            )

            if need_w:
                result.need_water.append(land.id)
            if need_g:
                result.need_weed.append(land.id)
            if need_b:
                result.need_insect.append(land.id)

            # 按阶段归类为可收获、枯萎或生长中
            if phase_val == plantpb_pb2.MATURE:
                result.harvestable.append(land.id)
            elif phase_val == plantpb_pb2.DEAD:
                result.dead.append(land.id)
            else:
                result.growing.append(land.id)

        return result

    def analyze_friend_lands(
        self,
        lands: list[plantpb_pb2.LandInfo],
        *,
        now_sec: int | None = None,
    ) -> LandAnalyzeResult:
        """好友农场分析：用于偷菜、帮忙、放虫、种草等决策"""
        now = int(now_sec or time.time())
        result = LandAnalyzeResult()

        for land in lands:
            # 好友地块缺少作物信息时直接跳过
            if not land.HasField("plant") or not land.plant.phases:
                continue

            plant = land.plant
            phase = self._resolve_current_phase(plant, now)

            # 成熟阶段仅处理偷菜，避免与其他操作冲突
            if phase.phase == plantpb_pb2.MATURE:
                if bool(plant.stealable):
                    result.stealable.append(land.id)
                continue

            if phase.phase == plantpb_pb2.DEAD:
                continue

            if int(plant.dry_num) > 0:
                result.need_water.append(land.id)

            weed_owners = list(plant.weed_owners or [])
            insect_owners = list(plant.insect_owners or [])
            if weed_owners:
                result.need_weed.append(land.id)
            if insect_owners:
                result.need_insect.append(land.id)

            # 每块地最多 2 个捣乱者，且避免重复由自己投放
            i_put_weed = any(v == self.account.gid for v in weed_owners)
            i_put_insect = any(v == self.account.gid for v in insect_owners)
            if len(weed_owners) < 2 and not i_put_weed:
                result.can_put_weed.append(land.id)
            if len(insect_owners) < 2 and not i_put_insect:
                result.can_put_insect.append(land.id)

        return result
