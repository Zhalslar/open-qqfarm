from __future__ import annotations

import json
from pathlib import Path
from collections.abc import Mapping, MutableMapping
from types import MappingProxyType
from typing import Any, get_type_hints


class ConfigNode:
    """
    Configuration node that converts a dict into a strongly-typed object.
    """

    _SCHEMA_CACHE: dict[type, dict[str, type]] = {}
    _FIELDS_CACHE: dict[type, set[str]] = {}

    @classmethod
    def _schema(cls) -> dict[str, type]:
        return cls._SCHEMA_CACHE.setdefault(cls, get_type_hints(cls))
    @classmethod
    def _fields(cls) -> set[str]:
        return cls._FIELDS_CACHE.setdefault(
            cls,
            {k for k in cls._schema() if not k.startswith("_")},
        )

    def __init__(self, data: MutableMapping[str, Any], root: ConfigNode | None = None):
        object.__setattr__(self, "_data", data)
        object.__setattr__(self, "_children", {})
        object.__setattr__(self, "_root", root or self)
        for key, tp in self._schema().items():
            if key.startswith("_"):
                continue
            if key in data:
                continue
            if hasattr(self.__class__, key):
                continue
            print(f"[config:{self.__class__.__name__}] miss key: {key}")

    def __getattr__(self, key: str) -> Any:
        if key in self._fields():
            value = self._data.get(key)
            tp = self._schema().get(key)

            if isinstance(tp, type) and issubclass(tp, ConfigNode):
                children: dict[str, ConfigNode] = self.__dict__["_children"]
                if key not in children:
                    if not isinstance(value, MutableMapping):
                        raise TypeError(
                            f"[config:{self.__class__.__name__}] "
                            f"Field '{key}' expects dict, got {type(value).__name__}"
                        )
                    children[key] = tp(value, root=self._root)
                return children[key]

            if value is None and key not in self._data and hasattr(self.__class__, key):
                return getattr(self.__class__, key)

            return value

        if key in self.__dict__:
            return self.__dict__[key]

        raise AttributeError(key)

    def __setattr__(self, key: str, value: Any) -> None:
        if key in self._fields():
            self._data[key] = value
            return
        object.__setattr__(self, key, value)

    def save_config(self) -> None:

        if self._root is self:
            raise NotImplementedError("Root node must implement save_config()")
        self._root.save_config()

    def raw_data(self) -> Mapping[str, Any]:
        return MappingProxyType(self._data)


# ================== project custom config ==================


class AccountConfig(ConfigNode):
    uin: str
    auth_code: str


class FarmConfig(ConfigNode):
    enable_auto: bool
    actions: list[str]
    base_minute: int
    harvest_sell: bool
    seed_mode: str
    preferred_seed_id: int
    normal_fertilize: bool
    organic_fertilize: bool


class FriendConfig(ConfigNode):
    enable_auto: bool
    actions: list[str]
    base_minute: int
    put_insect_count: int = 1
    put_weed_count: int = 1
    whitelist: list[str]
    blacklist: list[str]
    steal: bool
    help: bool
    bad: bool


class NotifyConfig(ConfigNode):
    actions: list[str]


class ClientConfig(ConfigNode):
    client_version: str
    appid: str
    platform: str
    os: str
    sys_software: str
    network: str
    memory: int
    device_id: str


class CoreConfig(ConfigNode):
    account: AccountConfig
    farm: FarmConfig
    friend: FriendConfig
    notify: NotifyConfig
    auto_reward: bool
    client: ClientConfig
    user_heartbeat: int
    ws_heartbeat: int
    rpc_timeout: int
    step_interval: float

    def __init__(self, config: MutableMapping[str, Any] | None = None):
        self.base_dir = Path(__file__).parent
        self.default_config_file = self.base_dir / "default_config.json"
        config_data = self.load_default_config() if config is None else config
        self._external_saver = (
            saver if callable(saver := getattr(config_data, "save_config", None)) else None
        )
        super().__init__(config_data, root=self)

        self.qqfarm_dir = self.base_dir
        self.game_data_dir = self.base_dir / "game_data"
        self.qr_code_dir = self.base_dir / "qr_code"
        self.qr_code_dir.mkdir(parents=True, exist_ok=True)
        self.qr_code_path = self.qr_code_dir / "login_qr.svg"

        self.gateway_ws_url = "wss://gate-obt.nqf.qq.com/prod/ws"
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 "
                "MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI "
                "MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)"
            )
        }
        self.origin = "https://gate-obt.nqf.qq.com"


    def load_default_config(self) -> dict[str, Any]:
        with self.default_config_file.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save_config(self) -> None:
        if self._external_saver:
            self._external_saver()
            return
        with self.default_config_file.open("w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    # ================= helpers =================

    def set_uin(self, uin: str):
        self.account.uin = uin
        self.save_config()

    def set_auth_code(self, auth_code: str):
        self.account.auth_code = auth_code
        self.save_config()

    def get_farm_interval(self) -> int:
        base = int(self.farm.base_minute) * 60
        return max(1, base)

    def get_friend_interval(self) -> int:
        base = int(self.friend.base_minute) * 60
        return max(1, base)

