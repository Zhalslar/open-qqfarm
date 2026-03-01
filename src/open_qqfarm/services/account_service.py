from google.protobuf.json_format import MessageToDict

from ..config import CoreConfig
from ..proto import BasicInfo, ItemChg
from ..session import GatewayGameSession
from ..models import RuntimeState
from ..services.log_service import logger
from ..services.game_data_service import GameDataService


class AccountService:
    def __init__(
        self,
        config: CoreConfig,
        runtime: RuntimeState,
        gdata: GameDataService,
        session: GatewayGameSession,
    ):
        self._cfg = config
        self._runtime = runtime
        self._gdata = gdata
        self._session = session

        self.uin: str = ""
        self.auth_code: str = ""

        self.coupon = 0

        self.basic: BasicInfo | None = None
        self.gid: int = 0
        self.name: str = ""
        self.level: int = 0
        self.exp: int = 0
        self.gold: int = 0
        self.open_id: str = ""
        self.avatar_url: str = ""
        self.remark: str = ""
        self.signature: str = ""
        self.gender: int = 0
        self.authorized_status: int = 0
        self.disable_nudge: bool = False

        self.update_from_cfg()

    def get_user_info(self):
        return {"name": self.name, "gid": self.gid}

    def set_uin(self, uin: str):
        self.uin = uin
        self._cfg.set_uin(uin)
        logger.info(f"已设置账号的 QQ 号: {uin}")

    def set_auth_code(self, auth_code: str):
        self.auth_code = auth_code
        self._cfg.set_auth_code(auth_code)
        if auth_code:
            self._runtime.has_auth_code = True
            logger.info(f"已设置账号的网关授权码: {auth_code}")
        else:
            self._runtime.has_auth_code = False
            logger.info("已清除账号的网关授权码")

    def clear_auth_code(self):
        self._runtime.has_auth_code = False
        self._cfg.set_auth_code("")
        if self.auth_code:
            self.auth_code = ""
            logger.info("已清空账号的网关授权码")

    def set_gold(self, gold: int):
        self.gold = gold
        logger.info(f"已设置账号的金币: {gold}")

    def set_exp(self, exp: int):
        self.exp = exp
        logger.info(f"已设置账号的经验: {exp}")

    def set_coupon(self, coupon: int):
        self.coupon = coupon
        logger.info(f"已设置的点券数: {coupon}")

    def adjust_gold(self, delta: int):
        self.coupon += delta
        if delta > 0:
            logger.info(f"金币+{delta}")
        else:
            logger.info(f"金币{delta}")

    def adjust_exp(self, delta: int):
        self.exp += delta
        if delta > 0:
            logger.info(f"经验+{delta}")
        else:
            logger.info(f"经验{delta}")

    def adjust_coupon(self, delta: int):
        self.coupon += delta
        if delta > 0:
            logger.info(f"点券+{delta}")
        else:
            logger.info(f"点券{delta}")
    
    def update_from_cfg(self) -> None:
        self.uin = self._cfg.account.uin
        self.auth_code = self._cfg.account.auth_code
        if self.auth_code:
            self._runtime.has_auth_code = True
            logger.info(
                "已从配置中获取到网关授权码",
                uin=self.uin,
                auth_code=self.auth_code,
            )
        else:
            self._runtime.has_auth_code = False

    def update_from_basic(self, basic: BasicInfo):
        self.basic = basic
        self.gid = basic.gid
        self.name = basic.name
        self.level = basic.level
        self.exp = basic.exp
        self.gold = basic.gold
        self.open_id = basic.open_id
        self.avatar_ur = basic.avatar_url
        self.remark = basic.remark
        self.signature = basic.signature
        self.gender = basic.gender
        self.authorized_status = basic.authorized_status
        self.disable_nudge = basic.disable_nudge
        logger.debug("账号信息已更新", basic=MessageToDict(basic))

    async def update_from_session(self):
        try:
            reply = await self._session.user_login()
        except Exception as e:
            logger.error(f"获取登录信息失败: {e}")
            return
        logger.debug("登录信息", reply=reply)
        self.update_from_basic(reply.basic)
        

    async def update_coupon_from_session(self):
        try:
            items = await self._session.item_bag()
            coupon_items = [item for item in items if item.id == 1002]
            coupon = sum(item.count for item in coupon_items)
            self.coupon = coupon
            logger.debug("已更新账号的点券数", coupon=coupon)
        except Exception as e:
            logger.debug(f"拉取点券数量失败: {e}")

    def update_from_notify(self, notify_items: list[ItemChg]):
        for chg in notify_items:
            item, delta = chg.item, chg.delta
            if item.id in {1, 1001}:  # GOLD
                self.adjust_gold(delta)

            elif item.id == 1101:  # EXP
                self.adjust_exp(delta)

            elif item.id == 1002:  # COUPON
                self.adjust_coupon(delta)
