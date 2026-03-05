from __future__ import annotations

from collections.abc import Awaitable, Callable

from ..config import CoreConfig
from ..models import RuntimeState
from ..proto import (
    Application,
    BasicInfo,
    GameFriend,
    GoodsInfo,
    Item,
    LandInfo,
    TaskInfo,
    friendpb_pb2,
    itempb_pb2,
    plantpb_pb2,
    shoppb_pb2,
    taskpb_pb2,
    userpb_pb2,
    visitpb_pb2,
)
from .gateway import GatewaySession, GatewaySessionError


class GatewayGameSessionError(GatewaySessionError):
    pass


class GatewayGameSession(GatewaySession):
    def __init__(self, config: CoreConfig, runtime: RuntimeState) -> None:
        super().__init__(config, runtime)

    async def user_login(self):
        req = userpb_pb2.LoginRequest(
            sharer_id=0,
            sharer_open_id="",
            device_info=userpb_pb2.DeviceInfo(
                client_version=self.cfg.client.client_version,
                sys_software=self.cfg.client.sys_software,
                network=self.cfg.client.network,
                memory=self.cfg.client.memory,
                device_id=self.cfg.client.device_id,
            ),
            share_cfg_id=0,
            scene_id="1256",
            report_data=userpb_pb2.ReportData(
                callback="",
                cd_extend_info="",
                click_id="",
                clue_token="",
                minigame_channel="other",
                minigame_platid=2,
                req_id="",
                trackid="",
            ),
        )
        reply = await self._call_proto(
            "gamepb.userpb.UserService",
            "Login",
            req,
            userpb_pb2.LoginReply(),
        )
        return reply

    async def user_heartbeat(self, gid: int) -> int:
        req = userpb_pb2.HeartbeatRequest(
            gid=gid,
            client_version=self.cfg.client.client_version,
        )
        reply = await self._call_proto(
            "gamepb.userpb.UserService",
            "Heartbeat",
            req,
            userpb_pb2.HeartbeatReply(),
        )
        return int(reply.server_time)

    async def user_report_ark_click(
        self,
        sharer_id: int,
        sharer_open_id: str = "",
        share_cfg_id: int = 0,
        scene_id: str = "",
    ) -> userpb_pb2.ReportArkClickReply:
        req = userpb_pb2.ReportArkClickRequest(
            sharer_id=int(sharer_id),
            sharer_open_id=str(sharer_open_id or ""),
            share_cfg_id=int(share_cfg_id),
            scene_id=str(scene_id or ""),
        )
        return await self._call_proto(
            "gamepb.userpb.UserService",
            "ReportArkClick",
            req,
            userpb_pb2.ReportArkClickReply(),
        )

    async def _batch_run(
        self,
        operation_runner: Callable[[list[int]], Awaitable[list[LandInfo]]],
        land_ids: list[int],
        direct_traverse: bool = False,
    ) -> list[LandInfo]:
        target_ids = [int(v) for v in land_ids]
        if not target_ids:
            return []

        async def run_traverse() -> list[LandInfo]:
            merged: list[LandInfo] = []
            failed_ids: list[int] = []
            first_error: Exception | None = None
            for land_id in target_ids:
                try:
                    merged.extend(await operation_runner([land_id]))
                except Exception as single_error:
                    failed_ids.append(int(land_id))
                    if first_error is None:
                        first_error = single_error
            if failed_ids:
                raise GatewayGameSessionError(
                    f"操作部分失败，failed_ids={failed_ids}"
                ) from first_error
            return merged

        if direct_traverse:
            return await run_traverse()

        try:
            return await operation_runner(target_ids)
        except Exception:
            if len(target_ids) <= 1:
                raise
            try:
                return await run_traverse()
            except Exception as single_error:
                raise GatewayGameSessionError(
                    "操作批量失败且逐块重试失败"
                ) from single_error

    async def plant_check_can_operate(self, host_gid: int, operation_id: int):
        req = plantpb_pb2.CheckCanOperateRequest(
            host_gid=int(host_gid),
            operation_id=operation_id,
        )
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "CheckCanOperate",
            req,
            plantpb_pb2.CheckCanOperateReply(),
        )
        return reply

    async def plant_all_lands(self, host_gid: int = 0) -> list[LandInfo]:
        req = plantpb_pb2.AllLandsRequest(host_gid=int(host_gid))
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "AllLands",
            req,
            plantpb_pb2.AllLandsReply(),
        )
        return list(reply.lands)

    async def plant_harvest(
        self, land_ids: list[int], host_gid: int, *, is_all: bool = True
    ) -> list[LandInfo]:
        req = plantpb_pb2.HarvestRequest(
            land_ids=land_ids,
            host_gid=host_gid,
            is_all=is_all,
        )
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "Harvest",
            req,
            plantpb_pb2.HarvestReply(),
        )
        return list(reply.land)

    async def plant_water_land(
        self, land_ids: list[int], host_gid: int
    ) -> list[LandInfo]:
        async def run_once(target_ids: list[int]) -> list[LandInfo]:
            ids = [int(v) for v in target_ids]
            if not ids:
                return []

            req = plantpb_pb2.WaterLandRequest(
                land_ids=ids,
                host_gid=int(host_gid),
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "WaterLand",
                req,
                plantpb_pb2.WaterLandReply(),
            )

            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def plant_weed_out(
        self, land_ids: list[int], host_gid: int
    ) -> list[LandInfo]:
        async def run_once(target_ids: list[int]) -> list[LandInfo]:
            ids = [int(v) for v in target_ids]
            if not ids:
                return []
            req = plantpb_pb2.WeedOutRequest(
                land_ids=ids,
                host_gid=int(host_gid),
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "WeedOut",
                req,
                plantpb_pb2.WeedOutReply(),
            )
            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def plant_insecticide(
        self, land_ids: list[int], host_gid: int
    ) -> list[LandInfo]:
        async def run_once(target_ids: list[int]) -> list[LandInfo]:
            ids = [int(v) for v in target_ids]
            if not ids:
                return []
            req = plantpb_pb2.InsecticideRequest(
                land_ids=ids,
                host_gid=int(host_gid),
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "Insecticide",
                req,
                plantpb_pb2.InsecticideReply(),
            )
            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def plant_remove(self, land_ids: list[int]) -> list[LandInfo]:
        async def run_once(ids: list[int]) -> list[LandInfo]:
            req = plantpb_pb2.RemovePlantRequest(land_ids=ids)
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "RemovePlant",
                req,
                plantpb_pb2.RemovePlantReply(),
            )
            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def plant_upgrade_land(self, land_id: int) -> LandInfo:
        req = plantpb_pb2.UpgradeLandRequest(land_id=int(land_id))
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "UpgradeLand",
            req,
            plantpb_pb2.UpgradeLandReply(),
        )
        return reply.land

    async def plant_unlock_land(
        self, land_id: int, do_shared: bool = False
    ) -> LandInfo:
        req = plantpb_pb2.UnlockLandRequest(
            land_id=int(land_id),
            do_shared=bool(do_shared),
        )
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "UnlockLand",
            req,
            plantpb_pb2.UnlockLandReply(),
        )
        return reply.land

    async def plant_seed(
        self,
        seed_id: int,
        land_ids: list[int],
        *,
        direct_traverse: bool = True,
    ) -> list[LandInfo]:
        async def run_once(target_ids: list[int]) -> list[LandInfo]:
            ids = [int(v) for v in target_ids]
            if not ids:
                return []

            req = plantpb_pb2.PlantRequest()
            req.items.append(
                plantpb_pb2.PlantItem(
                    seed_id=int(seed_id),
                    land_ids=ids,
                )
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "Plant",
                req,
                plantpb_pb2.PlantReply(),
            )
            return list(reply.land)

        return await self._batch_run(
            run_once, land_ids, direct_traverse=direct_traverse
        )

    async def plant_fertilize(
        self, land_ids: list[int], fertilizer_id: int
    ) -> list[LandInfo]:
        req = plantpb_pb2.FertilizeRequest(
            land_ids=land_ids,
            fertilizer_id=fertilizer_id,
        )
        reply = await self._call_proto(
            "gamepb.plantpb.PlantService",
            "Fertilize",
            req,
            plantpb_pb2.FertilizeReply(),
        )
        return reply.land

    async def plant_put_insects(
        self, host_gid: int, land_ids: list[int]
    ) -> list[LandInfo]:
        async def run_once(target_ids: list[int]) -> list[LandInfo]:
            ids = [int(v) for v in target_ids]
            if not ids:
                return []
            req = plantpb_pb2.PutInsectsRequest(
                host_gid=int(host_gid),
                land_ids=ids,
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "PutInsects",
                req,
                plantpb_pb2.PutInsectsReply(),
            )
            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def plant_put_weeds(
        self, host_gid: int, land_ids: list[int]
    ) -> list[LandInfo]:
        async def run_once(ids: list[int]) -> list[LandInfo]:
            req = plantpb_pb2.PutWeedsRequest(
                host_gid=int(host_gid),
                land_ids=ids,
            )
            reply = await self._call_proto(
                "gamepb.plantpb.PlantService",
                "PutWeeds",
                req,
                plantpb_pb2.PutWeedsReply(),
            )
            return list(reply.land)

        return await self._batch_run(run_once, land_ids)

    async def shop_info(self, shop_id: int = 2) -> list[GoodsInfo]:
        req = shoppb_pb2.ShopInfoRequest(shop_id=int(shop_id))
        reply = await self._call_proto(
            "gamepb.shoppb.ShopService",
            "ShopInfo",
            req,
            shoppb_pb2.ShopInfoReply(),
        )
        return list(reply.goods_list)

    async def shop_buy_goods(self, goods_id: int, num: int, price: int) -> list[Item]:
        req = shoppb_pb2.BuyGoodsRequest(
            goods_id=int(goods_id),
            num=int(num),
            price=int(price),
        )
        reply = await self._call_proto(
            "gamepb.shoppb.ShopService",
            "BuyGoods",
            req,
            shoppb_pb2.BuyGoodsReply(),
        )
        return list(reply.get_items)

    async def friend_get_all(self) -> list[GameFriend]:
        req = friendpb_pb2.GetAllRequest()
        reply = await self._call_proto(
            "gamepb.friendpb.FriendService",
            "GetAll",
            req,
            friendpb_pb2.GetAllReply(),
        )
        return list(reply.game_friends)

    async def friend_sync_all(self, open_ids: list[str]) -> list[GameFriend]:
        req = friendpb_pb2.SyncAllRequest(open_ids=open_ids)
        reply = await self._call_proto(
            "gamepb.friendpb.FriendService",
            "SyncAll",
            req,
            friendpb_pb2.SyncAllReply(),
        )
        return list(reply.game_friends)

    async def friend_get_applications(self) -> list[Application]:
        req = friendpb_pb2.GetApplicationsRequest()
        reply = await self._call_proto(
            "gamepb.friendpb.FriendService",
            "GetApplications",
            req,
            friendpb_pb2.GetApplicationsReply(),
        )
        return list(reply.applications)

    async def friend_accept(self, friend_gids: list[int]) -> list[GameFriend]:
        req = friendpb_pb2.AcceptFriendsRequest(friend_gids=friend_gids)
        reply = await self._call_proto(
            "gamepb.friendpb.FriendService",
            "AcceptFriends",
            req,
            friendpb_pb2.AcceptFriendsReply(),
        )
        return list(reply.friends)

    async def friend_reject(self, friend_gids: list[int]) -> int:
        async def run_once(gids: list[int]) -> int:
            if not gids:
                return 0
            req = friendpb_pb2.RejectFriendsRequest(friend_gids=gids)
            await self._call_proto(
                "gamepb.friendpb.FriendService",
                "RejectFriends",
                req,
                friendpb_pb2.RejectFriendsReply(),
            )
            return len(gids)

        gids = [int(v) for v in friend_gids if int(v) > 0]
        return await run_once(gids)

    async def friend_set_block_applications(self, block: bool) -> bool:
        req = friendpb_pb2.SetBlockApplicationsRequest(block=bool(block))
        reply = await self._call_proto(
            "gamepb.friendpb.FriendService",
            "SetBlockApplications",
            req,
            friendpb_pb2.SetBlockApplicationsReply(),
        )
        return bool(reply.block)

    async def visit_enter_friend(
        self, host_gid: int
    ) -> tuple[BasicInfo, list[LandInfo]]:
        req = visitpb_pb2.EnterRequest(
            host_gid=int(host_gid),
            reason=visitpb_pb2.ENTER_REASON_FRIEND,
        )
        reply = await self._call_proto(
            "gamepb.visitpb.VisitService",
            "Enter",
            req,
            visitpb_pb2.EnterReply(),
        )
        return reply.basic, list(reply.lands)

    async def visit_leave(self, host_gid: int) -> None:
        req = visitpb_pb2.LeaveRequest(host_gid=int(host_gid))
        await self._call_proto(
            "gamepb.visitpb.VisitService",
            "Leave",
            req,
            visitpb_pb2.LeaveReply(),
        )

    async def task_info(self) -> TaskInfo | None:
        req = taskpb_pb2.TaskInfoRequest()
        reply = await self._call_proto(
            "gamepb.taskpb.TaskService",
            "TaskInfo",
            req,
            taskpb_pb2.TaskInfoReply(),
        )
        if not reply.HasField("task_info"):
            return None
        return reply.task_info

    async def task_claim_reward(
        self, task_id: int, do_shared: bool = False
    ) -> list[Item]:
        req = taskpb_pb2.ClaimTaskRewardRequest(
            id=int(task_id),
            do_shared=bool(do_shared),
        )
        reply = await self._call_proto(
            "gamepb.taskpb.TaskService",
            "ClaimTaskReward",
            req,
            taskpb_pb2.ClaimTaskRewardReply(),
        )
        return list(reply.items)

    async def task_claim_daily_reward(
        self, active_type: int, point_ids: list[int]
    ) -> list[Item]:
        req = taskpb_pb2.ClaimDailyRewardRequest(
            type=int(active_type),
            point_ids=point_ids,
        )
        reply = await self._call_proto(
            "gamepb.taskpb.TaskService",
            "ClaimDailyReward",
            req,
            taskpb_pb2.ClaimDailyRewardReply(),
        )
        return list(reply.items)

    async def item_bag(self) -> list[Item]:
        req = itempb_pb2.BagRequest()
        reply = await self._call_proto(
            "gamepb.itempb.ItemService",
            "Bag",
            req,
            itempb_pb2.BagReply(),
        )
        return list(reply.item_bag.items)

    async def item_sell(self, items: list[Item]) -> tuple[list[Item], list[Item]]:
        req = itempb_pb2.SellRequest(items=items)
        reply = await self._call_proto(
            "gamepb.itempb.ItemService",
            "Sell",
            req,
            itempb_pb2.SellReply(),
        )
        sold_items = list(reply.sell_items)
        get_items = list(reply.get_items)
        return sold_items, get_items
