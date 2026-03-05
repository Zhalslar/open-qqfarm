from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Iterable
from collections.abc import Mapping
from collections.abc import MutableMapping
from pathlib import Path
from typing import Any
from urllib.parse import quote

from aiohttp import web
from google.protobuf.json_format import MessageToDict
from google.protobuf.message import Message as ProtobufMessage

from ..models import FertilizerId, OperationId
from ..proto import plantpb_pb2, shoppb_pb2
from ..services.land_service import to_time_sec
from ..services.log_service import logger
from ..core import QFarmCoreAPP


class DashboardServer:
    def __init__(
        self, core: QFarmCoreAPP, *, host: str = "127.0.0.1", port: int = 5173
    ) -> None:
        self.core = core
        self.host = str(host)
        self.port = int(port)

        base = Path(__file__).resolve().parent
        self._template_file = base / "templates" / "page.html"
        self._assets_dir = base / "assets"
        self._seed_image_dir = self.core.gdata.seed_image_dir
        self._qr_code_dir = self.core.cfg.qr_code_dir

        self._app = web.Application(middlewares=[self._no_cache_middleware])
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None
        self._register_routes()

    def _register_routes(self) -> None:
        self._app.router.add_get("/", self._page)
        self._app.router.add_get("/api/bootstrap", self._api_bootstrap)
        self._app.router.add_get("/api/account", self._api_account)
        self._app.router.add_get("/api/config", self._api_config)
        self._app.router.add_post("/api/config", self._api_config_update)
        self._app.router.add_post("/api/auth/login", self._api_auth_login)
        self._app.router.add_post("/api/auth/cancel-login", self._api_auth_cancel_login)
        self._app.router.add_post("/api/auth/logout", self._api_auth_logout)
        self._app.router.add_get("/api/friends", self._api_friends)
        self._app.router.add_get("/api/farm", self._api_farm)
        self._app.router.add_post("/api/farm/action", self._api_farm_action)
        self._app.router.add_get("/api/warehouse", self._api_warehouse)
        self._app.router.add_post("/api/warehouse/sell_item", self._api_warehouse_sell_item)
        self._app.router.add_post("/api/warehouse/sell_fruits", self._api_warehouse_sell_fruits)
        self._app.router.add_get("/api/shop", self._api_shop)
        self._app.router.add_post("/api/shop/buy", self._api_shop_buy)
        self._app.router.add_get("/api/logs", self._api_logs)
        self._app.router.add_get("/api/logs/stream", self._api_logs_stream)
        self._app.router.add_static("/assets/", str(self._assets_dir), show_index=False)
        self._app.router.add_static("/game-config/seed_images_named/", str(self._seed_image_dir), show_index=False)
        self._app.router.add_static("/runtime/qr/", str(self._qr_code_dir), show_index=False)

    @staticmethod
    @web.middleware
    async def _no_cache_middleware(
        request: web.Request,
        handler: Any,
    ) -> web.StreamResponse:
        resp = await handler(request)
        path = str(request.path or "")
        if path == "/" or path.startswith("/assets/"):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        return resp

    async def start(self) -> None:
        if self._runner is not None:
            return
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host=self.host, port=self.port)
        await self._site.start()
        logger.info("Dashboard 已启动", host=self.host, port=self.port, url=f"http://{self.host}:{self.port}")

    async def stop(self) -> None:
        if self._runner is None:
            return
        await self._runner.cleanup()
        self._runner = None
        self._site = None
        logger.info("Dashboard 已停止")

    @staticmethod
    def _ok(data: Any) -> web.Response:
        return web.json_response(
            {"status": "ok", "data": data},
            dumps=DashboardServer._json_dumps,
        )

    @staticmethod
    def _error(message: str, status: int = 400) -> web.Response:
        return web.json_response(
            {"status": "error", "message": str(message)},
            status=int(status),
            dumps=DashboardServer._json_dumps,
        )

    @staticmethod
    def _to_int(raw: Any, default: int) -> int:
        try:
            return int(str(raw).strip())
        except Exception:
            return int(default)

    @staticmethod
    def _to_bool(raw: Any, default: bool) -> bool:
        text = str(raw).strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
        return bool(default)

    @staticmethod
    def _gold_from_items(items: list[Any] | None) -> int:
        rows = list(items or [])
        return sum(int(getattr(item, "count", 0) or 0) for item in rows if int(getattr(item, "id", 0) or 0) in {1, 1001})

    @staticmethod
    def _json_default(value: Any) -> Any:
        if isinstance(value, ProtobufMessage):
            return MessageToDict(value, preserving_proto_field_name=True)

        if isinstance(value, Mapping):
            return {str(k): v for k, v in value.items()}

        if isinstance(value, (set, frozenset, tuple, list)):
            return list(value)

        if isinstance(value, (bytes, bytearray, memoryview)):
            try:
                return bytes(value).decode("utf-8")
            except Exception:
                return bytes(value).hex()

        if isinstance(value, Iterable) and not isinstance(value, (str, bytes, bytearray)):
            try:
                return list(value)
            except Exception:
                pass

        try:
            raw = vars(value)
            if isinstance(raw, dict):
                return {
                    str(k): v
                    for k, v in raw.items()
                    if not str(k).startswith("_") and not callable(v)
                }
        except Exception:
            pass

        return str(value)

    @staticmethod
    def _json_dumps(value: Any) -> str:
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            default=DashboardServer._json_default,
        )

    async def _page(self, _: web.Request) -> web.Response:
        if not self._template_file.exists():
            return web.Response(text="dashboard template not found", status=500)
        return web.Response(text=self._template_file.read_text(encoding="utf-8"), content_type="text/html")

    def _runtime_payload(self) -> dict[str, Any]:
        runtime = self.core.runtime
        account = self.core.account
        automation = getattr(self.core, "automation", None)
        automation_payload = {}
        if automation and hasattr(automation, "get_status_payload"):
            try:
                automation_payload = automation.get_status_payload()
            except Exception:
                automation_payload = {}
        return {
            "running": bool(runtime.running),
            "connected": bool(runtime.connected),
            "logging_in": bool(runtime.logging_in),
            "network_available": bool(runtime.network_available),
            "is_ready": bool(runtime.is_ready),
            "gid": int(account.gid),
            "automation": automation_payload,
        }

    def _account_payload(self) -> dict[str, Any]:
        account = self.core.account
        level = int(account.level or 0)
        exp = int(account.exp or 0)
        return {
            "gid": int(account.gid),
            "name": str(account.name or ""),
            "level": level,
            "exp": exp,
            "exp_progress": self._exp_progress_payload(level=level, exp=exp),
            "gold": int(account.gold or 0),
            "coupon": int(account.coupon or 0),
            "avatar_url": str(account.avatar_url or ""),
            "signature": str(account.signature or ""),
        }

    @staticmethod
    def _empty_exp_progress() -> dict[str, Any]:
        return {
            "base": 0,
            "next": 0,
            "current": 0,
            "total": 0,
            "percent": 0,
            "is_max_level": False,
        }

    def _exp_progress_payload(self, *, level: int, exp: int) -> dict[str, Any]:
        try:
            progress = self.core.gdata.get_level_exp_progress(level=int(level or 0), exp=int(exp or 0))
            if isinstance(progress, dict):
                return progress
        except Exception:
            pass
        return self._empty_exp_progress()

    def _normalize_exp_by_level(self, *, level: int, exp: int) -> int:
        lvl = max(0, int(level or 0))
        raw_exp = max(0, int(exp or 0))
        if raw_exp > 0 or lvl <= 1:
            return raw_exp
        try:
            base_exp, _ = self.core.gdata.get_level_exp_bounds(lvl)
            return max(raw_exp, int(base_exp or 0))
        except Exception:
            return raw_exp

    async def _api_bootstrap(self, _: web.Request) -> web.Response:
        runtime = self._runtime_payload()
        account = self._account_payload()
        if not runtime["is_ready"]:
            return self._ok(
                {
                    "runtime": runtime,
                    "account": account,
                    "friends": [],
                    "farm": self._empty_farm_payload(),
                    "message": "尚未登录完成，等待连接中",
                }
            )
        try:
            friends = await self._get_friends_payload()
            farm = await self._get_farm_payload(gid=None, cache=True)
        except RuntimeError as e:
            if "当前未就绪" in str(e):
                return self._ok(
                    {
                        "runtime": self._runtime_payload(),
                        "account": self._account_payload(),
                        "friends": [],
                        "farm": self._empty_farm_payload(),
                        "message": "连接状态已变化，等待重连中",
                    }
                )
            raise
        return self._ok(
            {
                "runtime": self._runtime_payload(),
                "account": self._account_payload(),
                "friends": friends,
                "farm": farm,
            }
        )

    async def _api_account(self, _: web.Request) -> web.Response:
        return self._ok({"runtime": self._runtime_payload(), "account": self._account_payload()})

    def _config_payload(self) -> dict[str, Any]:
        raw = self.core.cfg.raw_data()
        return json.loads(self._json_dumps(raw))

    @staticmethod
    def _coerce_config_scalar(raw: Any, ref: Any) -> Any:
        if isinstance(ref, bool):
            text = str(raw).strip().lower()
            if text in {"1", "true", "yes", "on"}:
                return True
            if text in {"0", "false", "no", "off"}:
                return False
            return bool(ref)
        if isinstance(ref, int) and not isinstance(ref, bool):
            try:
                return int(raw)
            except Exception:
                return int(ref)
        if isinstance(ref, float):
            try:
                return float(raw)
            except Exception:
                return float(ref)
        if isinstance(ref, str):
            return str(raw)
        return raw

    def _merge_config_mapping(self, target: MutableMapping[str, Any], source: Mapping[str, Any]) -> None:
        for key, raw_value in source.items():
            if key not in target:
                continue
            ref_value = target.get(key)
            if isinstance(ref_value, MutableMapping):
                if isinstance(raw_value, Mapping):
                    self._merge_config_mapping(ref_value, raw_value)
                continue
            if isinstance(ref_value, list):
                if not isinstance(raw_value, list):
                    continue
                if ref_value:
                    first = ref_value[0]
                    target[key] = [self._coerce_config_scalar(item, first) for item in raw_value]
                else:
                    target[key] = list(raw_value)
                continue
            target[key] = self._coerce_config_scalar(raw_value, ref_value)

    async def _api_config(self, _: web.Request) -> web.Response:
        return self._ok(self._config_payload())

    async def _api_config_update(self, request: web.Request) -> web.Response:
        body: dict[str, Any] = {}
        if request.can_read_body:
            try:
                raw = await request.json()
                if isinstance(raw, dict):
                    body = raw
            except Exception:
                body = {}
        payload = body.get("config", body)
        if not isinstance(payload, Mapping):
            return self._error("配置数据格式错误，必须是 JSON 对象", status=400)

        try:
            self._merge_config_mapping(self.core.cfg._data, payload)
            self.core.cfg.save_config()
            self.core.account.update_from_cfg()
            return self._ok(
                {
                    "config": self._config_payload(),
                    "runtime": self._runtime_payload(),
                    "account": self._account_payload(),
                    "message": "配置已保存",
                }
            )
        except Exception as e:
            return self._error(f"保存配置失败: {e}", status=500)

    async def _api_auth_login(self, _: web.Request) -> web.Response:
        runtime = self._runtime_payload()
        if runtime["is_ready"]:
            return self._ok(
                {
                    "runtime": runtime,
                    "account": self._account_payload(),
                    "qr_url": "",
                    "message": "当前已在线，无需扫码登录",
                }
            )

        if not runtime["logging_in"]:
            try:
                await self.core.start_login()
            except Exception as e:
                return self._error(f"发起二维码登录失败: {e}", status=500)

        return self._ok(
            {
                "runtime": self._runtime_payload(),
                "account": self._account_payload(),
                "qr_url": "/runtime/qr/login_qr.svg",
                "message": "二维码登录已发起，请使用 QQ 扫码",
            }
        )

    async def _api_auth_cancel_login(self, _: web.Request) -> web.Response:
        try:
            await self.core.cancel_login()
        except Exception as e:
            return self._error(f"取消登录失败: {e}", status=500)
        return self._ok(
            {
                "runtime": self._runtime_payload(),
                "account": self._account_payload(),
                "message": "已取消二维码登录",
            }
        )

    async def _api_auth_logout(self, _: web.Request) -> web.Response:
        try:
            await self.core.cancel_login()
            await self.core.logout()
            self.core.land.invalidate_cache()
        except Exception as e:
            return self._error(f"登出失败: {e}", status=500)
        return self._ok(
            {
                "runtime": self._runtime_payload(),
                "account": self._account_payload(),
                "friends": [],
                "farm": self._empty_farm_payload(),
                "message": "已登出账号",
            }
        )

    async def _api_friends(self, _: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._ok([])
        return self._ok(await self._get_friends_payload())

    async def _api_farm(self, request: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._ok(self._empty_farm_payload())
        raw_gid = str(request.query.get("gid", "")).strip()
        gid = int(raw_gid) if raw_gid.isdigit() else None
        cache = str(request.query.get("cache", "1")).strip() != "0"
        try:
            return self._ok(await self._get_farm_payload(gid=gid, cache=cache))
        except Exception as e:
            return self._error(f"加载农场失败: {e}", status=500)

    async def _api_farm_action(self, request: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._error("当前未就绪，请稍后重试", status=503)

        body: dict[str, Any] = {}
        if request.can_read_body:
            try:
                raw = await request.json()
                if isinstance(raw, dict):
                    body = raw
            except Exception:
                body = {}

        action = str(body.get("action", request.query.get("action", ""))).strip().lower()
        if not action:
            return self._error("缺少 action 参数", status=400)

        my_gid = int(self.core.account.gid or 0)
        gid = self._to_int(body.get("gid", request.query.get("gid", my_gid)), my_gid)
        if gid <= 0:
            gid = my_gid

        land_id = self._to_int(body.get("land_id", request.query.get("land_id", 0)), 0)
        if land_id <= 0:
            land_id = 0
        seed_item_id = self._to_int(body.get("seed_item_id", request.query.get("seed_item_id", 0)), 0)
        if seed_item_id <= 0:
            seed_item_id = 0

        try:
            data = await self._run_farm_action(
                action=action,
                gid=gid,
                land_id=(land_id or None),
                seed_item_id=seed_item_id,
            )
            return self._ok(data)
        except ValueError as e:
            return self._error(str(e), status=400)
        except Exception as e:
            return self._error(f"执行农场动作失败: {e}", status=500)

    async def _api_warehouse(self, _: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._ok([])
        try:
            rows = [self._item_payload(item) for item in await self.core.get_bag_items()]
            rows.sort(key=lambda row: (-int(row["count"]), int(row["item_id"])))
            return self._ok(rows)
        except Exception as e:
            return self._error(f"加载仓库失败: {e}", status=500)

    async def _api_warehouse_sell_item(self, request: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._error("当前未就绪，请稍后重试", status=503)

        body: dict[str, Any] = {}
        if request.can_read_body:
            try:
                raw = await request.json()
                if isinstance(raw, dict):
                    body = raw
            except Exception:
                body = {}

        item_id = self._to_int(body.get("item_id", request.query.get("item_id", "0")), 0)
        if item_id <= 0:
            return self._error("缺少 item_id 参数", status=400)

        try:
            bag_items = await self.core.get_bag_items()
            targets = [
                item
                for item in bag_items
                if int(getattr(item, "id", 0) or 0) == item_id
                and int(getattr(item, "count", 0) or 0) > 0
                and int(getattr(item, "uid", 0) or 0) > 0
            ]
            item_name = str(getattr(self.core.get_item_by_id(item_id), "name", "") or f"道具{item_id}")
            if not targets:
                return self._ok(
                    {
                        "item_id": int(item_id),
                        "sold_total_count": 0,
                        "gold_earned": 0,
                        "runtime": self._runtime_payload(),
                        "account": self._account_payload(),
                        "message": f"{item_name} 当前无可出售数量",
                    }
                )

            sold_items, get_items = await self.core.sell_items(targets)
            sold_total_count = sum(
                int(getattr(item, "count", 0) or 0)
                for item in sold_items
                if int(getattr(item, "id", 0) or 0) == item_id
            )
            gold_earned = self._gold_from_items(get_items)
            if sold_total_count <= 0:
                message = f"{item_name} 不可出售"
            else:
                message = f"出售成功：{item_name} x{sold_total_count}"
            return self._ok(
                {
                    "item_id": int(item_id),
                    "sold_total_count": int(max(0, sold_total_count)),
                    "gold_earned": int(max(0, gold_earned)),
                    "runtime": self._runtime_payload(),
                    "account": self._account_payload(),
                    "message": message,
                }
            )
        except Exception as e:
            return self._error(f"出售失败: {e}", status=500)

    async def _api_warehouse_sell_fruits(self, _: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._error("当前未就绪，请稍后重试", status=503)
        try:
            result = await self.core.sell_all_fruits()
            sold_total_count = sum(
                int(getattr(item, "count", 0) or 0)
                for item in list(getattr(result, "sold_items", []) or [])
                if int(getattr(item, "count", 0) or 0) > 0
            )
            gold_earned = int(getattr(result, "gold_earned", 0) or 0)
            if sold_total_count > 0:
                message = f"出售果实完成：{sold_total_count} 个，获得 {gold_earned} 金币"
            else:
                message = str(getattr(result, "message", "") or "没有可出售的果实")
            return self._ok(
                {
                    "sold_item_types": int(getattr(result, "sold_count", 0) or 0),
                    "sold_total_count": int(max(0, sold_total_count)),
                    "gold_earned": gold_earned,
                    "runtime": self._runtime_payload(),
                    "account": self._account_payload(),
                    "message": message,
                }
            )
        except Exception as e:
            return self._error(f"一键出售果实失败: {e}", status=500)

    async def _api_shop(self, request: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._ok([])
        try:
            shop_id = self._to_int(request.query.get("shop_id", "2"), 2)
            filter_unlocked = self._to_bool(request.query.get("filter_unlocked", "1"), True)
            if filter_unlocked:
                goods_rows = await self.core.get_available_goods_list(shop_id=shop_id)
            else:
                goods_rows = await self.core.get_goods_list(shop_id=shop_id)
            rows = [self._goods_payload(row) for row in goods_rows]
            rows.sort(key=lambda row: (int(row["unlock_level"]), int(row["item_id"])))
            return self._ok(rows)
        except Exception as e:
            return self._error(f"加载商店失败: {e}", status=500)

    async def _api_shop_buy(self, request: web.Request) -> web.Response:
        if not self._runtime_payload()["is_ready"]:
            return self._error("当前未就绪，请稍后重试", status=503)

        body: dict[str, Any] = {}
        if request.can_read_body:
            try:
                raw = await request.json()
                if isinstance(raw, dict):
                    body = raw
            except Exception:
                body = {}

        shop_id = self._to_int(body.get("shop_id", request.query.get("shop_id", "2")), 2)
        goods_id = self._to_int(body.get("goods_id", request.query.get("goods_id", "0")), 0)
        num = self._to_int(body.get("num", request.query.get("num", "0")), 0)
        if goods_id <= 0:
            return self._error("缺少 goods_id 参数", status=400)
        if num <= 0:
            return self._error("购买数量必须大于 0", status=400)

        try:
            goods_list = await self.core.get_goods_list(shop_id=shop_id)
            target_goods = next((row for row in goods_list if int(getattr(row, "id", 0)) == goods_id), None)
            if not target_goods:
                return self._error("商品不存在或已下架", status=404)

            if not bool(getattr(target_goods, "unlocked", False)):
                return self._error("该商品未解锁", status=400)

            limit_count = int(getattr(target_goods, "limit_count", 0))
            bought_num = int(getattr(target_goods, "bought_num", 0))
            if limit_count > 0:
                remain = max(0, limit_count - bought_num)
                if remain <= 0:
                    return self._error("该商品已达到购买上限", status=400)
                if num > remain:
                    return self._error(f"超过可购买上限，最多还可购买 {remain}", status=400)

            unit_price = int(getattr(target_goods, "price", 0))
            client_price = self._to_int(body.get("price", request.query.get("price", unit_price)), unit_price)
            if client_price != unit_price:
                return self._error("商品价格已变化，请刷新后重试", status=400)

            received_items = await self.core.buy_goods(goods_id=goods_id, num=num, price=unit_price)
            seed_item_id = int(getattr(target_goods, "item_id", 0))
            received_count = sum(
                int(getattr(item, "count", 0))
                for item in received_items
                if int(getattr(item, "id", 0)) == seed_item_id
            )
            if received_count <= 0:
                received_count = int(getattr(target_goods, "item_count", 0)) * int(num)

            return self._ok(
                {
                    "goods_id": goods_id,
                    "item_id": seed_item_id,
                    "num": int(num),
                    "price": unit_price,
                    "total_price": unit_price * int(num),
                    "received_count": int(received_count),
                    "runtime": self._runtime_payload(),
                    "account": self._account_payload(),
                    "message": f"购买成功：{self.core.get_plant_name_by_seed(seed_item_id)} x{int(received_count)}",
                }
            )
        except Exception as e:
            return self._error(f"购买失败: {e}", status=500)

    async def _api_logs(self, request: web.Request) -> web.Response:
        limit = self._to_int(request.query.get("limit", "200"), 200)
        since = self._to_int(request.query.get("since", "0"), 0)
        if since > 0:
            return self._ok(logger.list_since(since, limit=max(1, limit)))
        return self._ok(logger.list(limit=max(1, limit)))

    @staticmethod
    async def _sse_send(stream: web.StreamResponse, *, event: str, payload: Any) -> None:
        body = f"event: {event}\ndata: {DashboardServer._json_dumps(payload)}\n\n".encode("utf-8")
        await stream.write(body)

    async def _api_logs_stream(self, request: web.Request) -> web.StreamResponse:
        resp = web.StreamResponse(
            status=200,
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
        await resp.prepare(request)

        since = self._to_int(request.query.get("since", "0"), 0)
        for row in logger.list_since(since, limit=300):
            await self._sse_send(resp, event="log", payload=row)

        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)
        loop = asyncio.get_running_loop()

        def _enqueue(row: dict[str, Any]) -> None:
            try:
                queue.put_nowait(row)
            except asyncio.QueueFull:
                pass

        def _on_log(row: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(_enqueue, row)

        unsubscribe = logger.subscribe(_on_log)
        try:
            while True:
                try:
                    row = await asyncio.wait_for(queue.get(), timeout=15.0)
                    await self._sse_send(resp, event="log", payload=row)
                except asyncio.TimeoutError:
                    await resp.write(b": keep-alive\n\n")
        except (asyncio.CancelledError, ConnectionError):
            pass
        finally:
            unsubscribe()
        return resp

    async def _get_friends_payload(self) -> list[dict[str, Any]]:
        rows = await self.core.get_all_friends()
        data = [
            {
                "gid": int(row.gid),
                "name": str(row.name),
                "level": int(row.level),
                "open_id": str(row.open_id),
                "avatar_url": str(row.avatar_url),
            }
            for row in rows
        ]
        data.sort(key=lambda r: (-r["level"], r["name"], r["gid"]))
        return data

    @staticmethod
    def _action_label(action: str) -> str:
        mapping = {
            "plant": "种植",
            "buy_seed": "购种",
            "fertilize_normal": "施普通肥",
            "fertilize_organic": "施有机肥",
            "harvest": "收获",
            "water": "浇水",
            "weed": "除草",
            "insect": "除虫",
            "remove": "清理",
            "steal": "偷菜",
            "help_water": "帮浇水",
            "help_weed": "帮除草",
            "help_insect": "帮除虫",
        }
        return mapping.get(str(action), str(action))

    @staticmethod
    def _action_event_from_log_row(row: dict[str, Any] | None) -> dict[str, Any]:
        source = row or {}
        fields: dict = source.get("fields", {})
        loop = str(fields.get("loop", "")).strip().lower()
        op = str(fields.get("op", "")).strip().lower()
        count = int(fields.get("count", 0) or 0)
        return {
            "seq": int(source.get("seq", 0) or 0),
            "ts": int(source.get("ts", 0) or 0),
            "source": str(fields.get("source", "") or ""),
            "loop": loop if loop in {"farm", "friend"} else "",
            "op": op,
            "count": max(0, count),
            "effective": bool(fields.get("effective", False)),
            "gid": int(fields.get("gid", 0) or 0),
            "land_id": int(fields.get("land_id", 0) or 0),
            "goods_id": int(fields.get("goods_id", 0) or 0),
            "item_id": int(fields.get("item_id", 0) or 0),
        }

    @staticmethod
    def _pick_target_land_ids(candidates: list[int], land_id: int | None) -> list[int]:
        picked = sorted({int(v) for v in candidates if int(v) > 0})
        if land_id is None:
            return picked
        target = int(land_id)
        if target <= 0:
            return picked
        return [target] if target in picked else []

    async def _run_farm_action(
        self,
        *,
        action: str,
        gid: int,
        land_id: int | None,
        seed_item_id: int = 0,
    ) -> dict[str, Any]:
        action = str(action).strip().lower()
        my_gid = int(self.core.account.gid or 0)
        host_gid = int(gid or my_gid)
        is_friend = bool(host_gid != my_gid)

        my_actions = {
            "buy_seed",
            "plant",
            "fertilize_normal",
            "fertilize_organic",
            "harvest",
            "water",
            "weed",
            "insect",
            "remove",
        }
        friend_actions = {"steal", "help_water", "help_weed", "help_insect"}
        if is_friend and action not in friend_actions:
            raise ValueError(f"好友农场不支持动作: {action}")
        if (not is_friend) and action not in my_actions:
            raise ValueError(f"自家农场不支持动作: {action}")

        if is_friend:
            _, lands = await self.core.get_friend_lands(host_gid, cache=False)
            analyze = self.core.land.analyze_friend_lands(lands)
        else:
            lands = await self.core.get_all_lands(cache=False)
            analyze = self.core.land.analyze_lands(lands)

        op_label = self._action_label(action)
        count = 0
        message = ""
        loop_key = "friend" if is_friend else "farm"
        action_fields: dict[str, int] = {}

        async def _resolve_seed_for_farm_action() -> tuple[Any | None, str]:
            preferred_seed_item_id = int(seed_item_id or 0)
            seed = None
            seed_notice = ""
            if preferred_seed_item_id > 0:
                try:
                    goods_rows = await self.core.get_available_goods_list()
                    seed = next(
                        (
                            row
                            for row in goods_rows
                            if int(getattr(row, "item_id", 0)) == preferred_seed_item_id
                        ),
                        None,
                    )
                except Exception:
                    seed = None
                if seed is None:
                    seed_notice = "高亮种子不可用，已按配置自动选种"
            if seed is None:
                seed = await self.core.farm.choose_seed()
            return seed, seed_notice

        if action == "plant":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "empty", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无空地可种植"
                )
            else:
                seed, seed_notice = await _resolve_seed_for_farm_action()
                if not seed:
                    message = "没有可用种子"
                else:
                    action_fields = {
                        "item_id": max(0, int(getattr(seed, "item_id", 0) or 0)),
                    }
                    stock = await self.core.warehouse.get_item_count(int(seed.item_id))
                    if stock <= 0:
                        seed_name = self.core.get_plant_name_by_seed(int(seed.item_id))
                        message = f"{seed_name} 种子库存不足，请先执行购种"
                    else:
                        prepared_ids = target_ids[:stock]
                        changed = await self.core.session.plant_seed(
                            seed_id=int(seed.item_id),
                            land_ids=prepared_ids,
                            direct_traverse=True,
                        )
                        count = len(changed)
                        seed_name = self.core.get_plant_name_by_seed(int(seed.item_id))
                        if count > 0:
                            message = f"成功种下 {count} 颗 {seed_name} 种子"
                        else:
                            message = "种植无动作"
                        if count > 0 and count < len(target_ids):
                            message = (
                                f"{message}，库存不足，剩余 {max(0, len(target_ids) - count)} 块空地"
                            )
                        if seed_notice:
                            message = f"{seed_notice}，{message}"

        elif action == "buy_seed":
            target_ids = self._pick_target_land_ids(
                list(getattr(analyze, "empty", [])),
                land_id,
            )
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无空地，无需购种"
                )
            else:
                seed, seed_notice = await _resolve_seed_for_farm_action()
                if not seed:
                    message = "没有可购种子"
                else:
                    _, prepare_message, buy_extra = await self.core.farm._prepare_seed_and_buy(
                        seed,
                        target_ids,
                    )
                    bought_count = max(0, int(buy_extra.get("count", 0) or 0))
                    if bought_count > 0:
                        seed_name = self.core.get_plant_name_by_seed(int(seed.item_id))
                        count = bought_count
                        message = prepare_message or f"购种完成 {count} 个 {seed_name} 种子"
                        action_fields = {
                            "goods_id": max(0, int(buy_extra.get("goods_id", 0) or 0)),
                            "item_id": max(0, int(buy_extra.get("item_id", 0) or 0)),
                        }
                    else:
                        message = prepare_message or "背包种子充足，无需购种"
                    if seed_notice:
                        message = f"{seed_notice}，{message}"

        elif action == "fertilize_normal":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "growing", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无生长中作物可施肥"
                )
            else:
                changed = await self.core.session.plant_fertilize(
                    land_ids=target_ids,
                    fertilizer_id=int(FertilizerId.NORMAL),
                )
                count = len(changed)
                message = f"普通肥施加完成 {count} 块" if count > 0 else "普通肥施加无动作"

        elif action == "fertilize_organic":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "growing", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无生长中作物可施肥"
                )
            else:
                changed = await self.core.session.plant_fertilize(
                    land_ids=target_ids,
                    fertilizer_id=int(FertilizerId.ORGANIC),
                )
                count = len(changed)
                message = f"有机肥施加完成 {count} 块" if count > 0 else "有机肥施加无动作"

        elif action == "harvest":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "harvestable", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无可收获作物"
                )
            else:
                changed = await self.core.session.plant_harvest(target_ids, host_gid=my_gid, is_all=True)
                count = len(changed)
                message = f"收获完成 {count} 块" if count > 0 else "收获无动作"

        elif action == "water":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_water", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无缺水作物"
                )
            else:
                changed = await self.core.session.plant_water_land(target_ids, host_gid=my_gid)
                count = len(changed)
                message = f"浇水完成 {count} 块" if count > 0 else "浇水无动作"

        elif action == "weed":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_weed", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无杂草地块"
                )
            else:
                changed = await self.core.session.plant_weed_out(target_ids, host_gid=my_gid)
                count = len(changed)
                message = f"除草完成 {count} 块" if count > 0 else "除草无动作"

        elif action == "insect":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_insect", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无害虫地块"
                )
            else:
                changed = await self.core.session.plant_insecticide(target_ids, host_gid=my_gid)
                count = len(changed)
                message = f"除虫完成 {count} 块" if count > 0 else "除虫无动作"

        elif action == "remove":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "dead", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无枯萎作物"
                )
            else:
                changed = await self.core.session.plant_remove(target_ids)
                count = len(changed)
                message = f"清理完成 {count} 块" if count > 0 else "清理无动作"

        elif action == "steal":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "stealable", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无可偷作物"
                )
            else:
                check = await self.core.session.plant_check_can_operate(
                    host_gid=host_gid,
                    operation_id=int(OperationId.STEAL),
                )
                if not bool(getattr(check, "can_operate", False)):
                    message = "今日偷菜次数已用完"
                else:
                    can_steal_num = int(getattr(check, "can_steal_num", 0))
                    if can_steal_num > 0:
                        target_ids = target_ids[:can_steal_num]
                    if not target_ids:
                        message = "今日偷菜次数不足"
                    else:
                        changed = await self.core.session.plant_harvest(
                            target_ids,
                            host_gid=host_gid,
                            is_all=True,
                        )
                        count = len(changed)
                        message = f"偷菜完成 {count} 块" if count > 0 else "偷菜无动作"

        elif action == "help_water":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_water", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无可帮浇水地块"
                )
            else:
                changed = await self.core.session.plant_water_land(target_ids, host_gid=host_gid)
                count = len(changed)
                message = f"帮浇水完成 {count} 块" if count > 0 else "浇水无动作"

        elif action == "help_weed":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_weed", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无可帮除草地块"
                )
            else:
                changed = await self.core.session.plant_weed_out(target_ids, host_gid=host_gid)
                count = len(changed)
                message = f"帮除草完成 {count} 块" if count > 0 else "除草无动作"

        elif action == "help_insect":
            target_ids = self._pick_target_land_ids(list(getattr(analyze, "need_insect", [])), land_id)
            if not target_ids:
                message = (
                    f"地块 #{int(land_id or 0)} 当前不能{op_label}"
                    if land_id
                    else "当前无可帮除虫地块"
                )
            else:
                changed = await self.core.session.plant_insecticide(target_ids, host_gid=host_gid)
                count = len(changed)
                message = f"帮除虫完成 {count} 块" if count > 0 else "除虫无动作"

        self.core.land.invalidate_cache(host_gid=host_gid, friend=is_friend)
        fresh_farm = await self._get_farm_payload(gid=host_gid if is_friend else None, cache=False)
        action_event_row = logger.info(
            "农场动作事件",
            event="farm_action",
            source="manual",
            loop=loop_key,
            op=action,
            count=int(count),
            effective=bool(int(count) > 0),
            gid=int(host_gid),
            land_id=int(land_id or 0),
            **action_fields,
        )
        return {
            "action": action,
            "gid": host_gid,
            "land_id": int(land_id or 0),
            "count": int(count),
            "message": message or "操作完成",
            "farm": fresh_farm,
            "action_event": self._action_event_from_log_row(action_event_row),
        }

    def _empty_farm_payload(self) -> dict[str, Any]:
        return {
            "is_friend": False,
            "owner": {"gid": 0, "name": "未连接", "level": 0, "avatar_url": ""},
            "basic": {
                "gid": 0,
                "name": "未连接",
                "level": 0,
                "exp": 0,
                "exp_progress": self._empty_exp_progress(),
                "avatar_url": "",
                "signature": "",
                "open_id": "",
            },
            "grid_cols": 6,
            "grid_rows": 4,
            "lands": [self._empty_land_tile(i + 1) for i in range(24)],
            "summary": {
                "harvestable": 0,
                "dead": 0,
                "need_water": 0,
                "need_weed": 0,
                "need_insect": 0,
                "empty": 0,
                "locked": 24,
            },
        }

    async def _get_farm_payload(self, *, gid: int | None, cache: bool) -> dict[str, Any]:
        my_gid = int(self.core.account.gid or 0)
        is_friend = bool(gid and int(gid) != my_gid)
        if not is_friend:
            lands = await self.core.get_all_lands(cache=cache)
            analyze = self.core.land.analyze_lands(lands)
            level = int(self.core.account.level or 0)
            exp = int(self.core.account.exp or 0)
            owner = {
                "gid": my_gid,
                "name": str(self.core.account.name),
                "level": level,
                "avatar_url": str(self.core.account.avatar_url or ""),
            }
            basic = {
                "gid": my_gid,
                "name": str(self.core.account.name or ""),
                "level": level,
                "exp": exp,
                "exp_progress": self._exp_progress_payload(level=level, exp=exp),
                "avatar_url": str(self.core.account.avatar_url or ""),
                "signature": str(self.core.account.signature or ""),
                "open_id": "",
            }
            return self._farm_payload(lands=lands, analyze=analyze, owner=owner, basic=basic, is_friend=False)

        host_gid = int(gid or 0)
        basic, lands = await self.core.get_friend_lands(host_gid, cache=cache)
        analyze = self.core.land.analyze_friend_lands(lands)
        owner = {
            "gid": host_gid,
            "name": str(getattr(basic, "name", "")),
            "level": int(getattr(basic, "level", 0)),
            "avatar_url": str(getattr(basic, "avatar_url", "")),
        }
        friend = await self.core.get_friend_by_gid(host_gid, cache=True)
        if friend:
            if not owner["avatar_url"]:
                owner["avatar_url"] = str(friend.avatar_url)
            if not owner["name"]:
                owner["name"] = str(friend.name)
            if int(owner["level"]) <= 0:
                owner["level"] = int(friend.level)
        basic_level = int(getattr(basic, "level", 0) or owner["level"])
        basic_exp = self._normalize_exp_by_level(
            level=basic_level,
            exp=int(getattr(basic, "exp", 0) or 0),
        )
        basic_payload = {
            "gid": host_gid,
            "name": str(getattr(basic, "name", "") or owner["name"]),
            "level": basic_level,
            "exp": basic_exp,
            "exp_progress": self._exp_progress_payload(level=basic_level, exp=basic_exp),
            "avatar_url": str(getattr(basic, "avatar_url", "") or owner["avatar_url"]),
            "signature": str(getattr(basic, "signature", "")),
            "open_id": str(getattr(basic, "open_id", "")),
        }
        return self._farm_payload(lands=lands, analyze=analyze, owner=owner, basic=basic_payload, is_friend=True)

    def _farm_payload(
        self,
        *,
        lands: list[plantpb_pb2.LandInfo],
        analyze: Any,
        owner: dict[str, Any],
        basic: dict[str, Any],
        is_friend: bool,
    ) -> dict[str, Any]:
        flags = {
            "harvestable": set(getattr(analyze, "harvestable", [])),
            "dead": set(getattr(analyze, "dead", [])),
            "need_water": set(getattr(analyze, "need_water", [])),
            "need_weed": set(getattr(analyze, "need_weed", [])),
            "need_insect": set(getattr(analyze, "need_insect", [])),
        }
        sorted_lands = sorted(lands, key=lambda row: int(row.id))
        picked = sorted_lands[:24]
        while len(picked) < 24:
            picked.append(None)  # type: ignore[arg-type]

        tiles: list[dict[str, Any]] = []
        for idx, land in enumerate(picked, start=1):
            if land is None:
                tiles.append(self._empty_land_tile(idx))
            else:
                tiles.append(self._land_tile_payload(display_slot=idx, land=land, flags=flags, is_friend=is_friend))

        return {
            "is_friend": bool(is_friend),
            "owner": owner,
            "basic": basic,
            "grid_cols": 6,
            "grid_rows": 4,
            "lands": tiles,
            "summary": {
                "harvestable": len(getattr(analyze, "harvestable", [])),
                "dead": len(getattr(analyze, "dead", [])),
                "need_water": len(getattr(analyze, "need_water", [])),
                "need_weed": len(getattr(analyze, "need_weed", [])),
                "need_insect": len(getattr(analyze, "need_insect", [])),
                "empty": len(getattr(analyze, "empty", [])),
                "locked": len([row for row in lands if not bool(row.unlocked)]),
            },
        }

    @staticmethod
    def _phase_name(phase: int) -> str:
        mapping = {
            int(plantpb_pb2.SEED): "种子",
            int(plantpb_pb2.GERMINATION): "发芽",
            int(plantpb_pb2.SMALL_LEAVES): "幼苗",
            int(plantpb_pb2.LARGE_LEAVES): "生长",
            int(plantpb_pb2.BLOOMING): "开花",
            int(plantpb_pb2.MATURE): "成熟",
            int(plantpb_pb2.DEAD): "枯萎",
        }
        return mapping.get(int(phase), "未知")

    @staticmethod
    def _resolve_phase(plant: plantpb_pb2.PlantInfo, now_sec: int) -> plantpb_pb2.PlantPhaseInfo:
        phase = plant.phases[0]
        begin_at = -1
        for item in plant.phases:
            begin = to_time_sec(int(item.begin_time))
            if begin <= 0:
                continue
            if begin <= now_sec and begin >= begin_at:
                phase = item
                begin_at = begin
        return phase

    @staticmethod
    def _next_phase_seconds(plant: plantpb_pb2.PlantInfo, now_sec: int) -> int:
        times = [to_time_sec(int(item.begin_time)) for item in plant.phases if to_time_sec(int(item.begin_time)) > now_sec]
        if not times:
            return 0
        return max(0, min(times) - now_sec)

    def _land_tile_payload(
        self,
        *,
        display_slot: int,
        land: plantpb_pb2.LandInfo,
        flags: dict[str, set[int]],
        is_friend: bool,
    ) -> dict[str, Any]:
        now = int(time.time())
        land_id = int(land.id)
        unlocked = bool(land.unlocked)
        raw_land_level = int(getattr(land, "level", 0) or 0)
        if raw_land_level <= 0:
            raw_land_level = int(getattr(land, "lands_level", 0) or 0)
        land_level = max(1, min(4, raw_land_level)) if raw_land_level > 0 else 1

        if not unlocked:
            return {
                "slot": int(display_slot),
                "land_id": land_id,
                "land_level": int(land_level),
                "status": "locked",
                "status_label": "未解锁",
                "unlocked": False,
                "plant_name": "",
                "phase_label": "",
                "image": "",
                "badges": [],
                "operations": [],
                "recommended_action": "",
                "actionable": False,
            }

        if (not land.HasField("plant")) or (not land.plant.phases):
            operations = [] if is_friend else ["plant"]
            return {
                "slot": int(display_slot),
                "land_id": land_id,
                "land_level": int(land_level),
                "status": "empty",
                "status_label": "空地",
                "unlocked": True,
                "plant_name": "",
                "phase_label": "",
                "image": "",
                "badges": [],
                "operations": operations,
                "recommended_action": operations[0] if operations else "",
                "actionable": bool(operations),
            }

        plant = land.plant
        plant_id = int(plant.id)
        seed_id = int(self.core.gdata.get_seed_id_by_plant(plant_id))
        image = str(self.core.gdata.get_seed_image(seed_id))
        phase = self._resolve_phase(plant, now)
        phase_value = int(phase.phase)
        phase_label = self._phase_name(phase_value)
        countdown = self._next_phase_seconds(plant, now)

        in_harvest = (land_id in flags["harvestable"]) or phase_value == int(plantpb_pb2.MATURE)
        in_dead = land_id in flags["dead"]
        need_water = land_id in flags["need_water"]
        need_weed = land_id in flags["need_weed"]
        need_insect = land_id in flags["need_insect"]
        can_steal = bool(getattr(plant, "stealable", False)) and is_friend

        if in_dead:
            status = "dead"
            status_label = "枯萎"
        elif in_harvest:
            status = "mature"
            status_label = "可收获"
        else:
            status = "growing"
            status_label = "生长中"

        badges: list[str] = []
        if need_water:
            badges.append("缺水")
        if need_weed:
            badges.append("有草")
        if need_insect:
            badges.append("有虫")
        if can_steal:
            badges.append("可偷")

        if is_friend:
            operations = []
            if need_water:
                operations.append("help_water")
            if need_weed:
                operations.append("help_weed")
            if need_insect:
                operations.append("help_insect")
            if can_steal:
                operations.append("steal")
        else:
            operations = []
            if in_dead:
                operations.append("remove")
            elif in_harvest:
                operations.append("harvest")
            if need_water:
                operations.append("water")
            if need_weed:
                operations.append("weed")
            if need_insect:
                operations.append("insect")

        return {
            "slot": int(display_slot),
            "land_id": land_id,
            "land_level": int(land_level),
            "status": status,
            "status_label": status_label,
            "unlocked": True,
            "plant_id": plant_id,
            "plant_name": str(plant.name or self.core.gdata.get_plant_name(plant_id)),
            "seed_id": seed_id,
            "phase": phase_value,
            "phase_label": phase_label,
            "countdown_sec": int(countdown),
            "image": image,
            "badges": badges,
            "operations": operations,
            "recommended_action": operations[0] if operations else "",
            "actionable": bool(operations),
            "meta": {
                "stealable": bool(getattr(plant, "stealable", False)),
                "left_fruit_num": int(getattr(plant, "left_fruit_num", 0)),
                "dry_num": int(getattr(plant, "dry_num", 0)),
                "weed_owners": list(getattr(plant, "weed_owners", [])),
                "insect_owners": list(getattr(plant, "insect_owners", [])),
            },
        }

    @staticmethod
    def _empty_land_tile(slot: int) -> dict[str, Any]:
        return {
            "slot": int(slot),
            "land_id": 0,
            "land_level": 1,
            "status": "locked",
            "status_label": "未开放",
            "unlocked": False,
            "plant_name": "",
            "phase_label": "",
            "image": "",
            "badges": [],
            "operations": [],
            "recommended_action": "",
            "actionable": False,
        }

    def _item_payload(self, item: Any) -> dict[str, Any]:
        item_id = int(item.id)
        info = self.core.get_item_by_id(item_id)
        name = str(info.name) if info else ""
        if not name and self.core.gdata.is_fruit_item(item_id):
            name = self.core.get_fruit_name(item_id)
        if not name:
            name = f"道具{item_id}"
        image = self._resolve_item_image(item_id=item_id, info=info)
        desc = str(getattr(info, "desc", "") or "").strip() if info else ""
        effect_desc = str(getattr(info, "effect_desc", "") or "").strip() if info else ""
        interaction_type = str(getattr(info, "interaction_type", "") or "").strip().lower() if info else ""
        is_seed = bool(getattr(info, "is_seed", False)) if info else False
        return {
            "item_id": item_id,
            "name": name,
            "desc": desc,
            "effect_desc": effect_desc,
            "interaction_type": interaction_type,
            "is_seed": bool(is_seed),
            "count": int(item.count),
            "uid": int(item.uid),
            "seed_image": image,
            "image": image,
            "raw": MessageToDict(item, preserving_proto_field_name=True),
        }

    def _goods_payload(self, goods: Any) -> dict[str, Any]:
        seed_id = int(goods.item_id)
        info = self.core.get_item_by_id(seed_id)
        plant = self.core.get_plant_by_seed(seed_id)
        grow_time_sec = int(getattr(plant, "grow_time_sec", 0) or 0) if plant else 0
        interaction_type = str(getattr(info, "interaction_type", "")).lower() if info else ""
        if interaction_type.startswith("fertilizer"):
            goods_name = str(getattr(info, "name", "") or f"道具{seed_id}")
        else:
            goods_name = self.core.get_plant_name_by_seed(seed_id)
        unlock_level = 0
        for cond in list(getattr(goods, "conds", [])):
            if int(getattr(cond, "type", 0)) == int(shoppb_pb2.MIN_LEVEL):
                unlock_level = int(getattr(cond, "param", 0))
                break
        return {
            "goods_id": int(goods.id),
            "item_id": seed_id,
            "name": goods_name,
            "price": int(goods.price),
            "item_count": int(goods.item_count),
            "unlock_level": int(unlock_level),
            "unlocked": bool(getattr(goods, "unlocked", False)),
            "bought_num": int(goods.bought_num),
            "limit_count": int(goods.limit_count),
            "shop_id": int(getattr(goods, "shop_id", 2)),
            "grow_time_sec": grow_time_sec,
            "seed_image": self._resolve_item_image(item_id=seed_id, info=info),
            "raw": MessageToDict(goods, preserving_proto_field_name=True),
        }

    def _resolve_item_image(self, *, item_id: int, info: Any | None) -> str:
        if int(item_id) >= 20000:
            image = str(self.core.get_seed_image(int(item_id)) or "")
            if image:
                return image

        plant = self.core.get_plant_by_fruit(int(item_id))
        if plant:
            seed_id = int(getattr(plant, "seed_id", 0))
            if seed_id > 0:
                image = str(self.core.get_seed_image(seed_id) or "")
                if image:
                    return image

        interaction_type = str(getattr(info, "interaction_type", "")).strip().lower() if info else ""
        item_name = str(getattr(info, "name", "")).strip() if info else ""
        if interaction_type == "fertilizerpro" or "有机化肥" in item_name:
            return self._organic_fertilizer_icon()
        if interaction_type in {"fertilizer", "fertilizerbucket"} and "化肥" in item_name:
            return self._normal_fertilizer_icon()
        return ""

    @staticmethod
    def _svg_data_uri(svg: str) -> str:
        return f"data:image/svg+xml;utf8,{quote(svg)}"

    def _normal_fertilizer_icon(self) -> str:
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>"
            "<defs><linearGradient id='g1' x1='0' y1='0' x2='0' y2='1'>"
            "<stop offset='0%' stop-color='#ffe484'/><stop offset='100%' stop-color='#f6b93e'/>"
            "</linearGradient></defs>"
            "<rect x='14' y='10' width='52' height='60' rx='12' fill='url(#g1)' stroke='#b97316' stroke-width='3'/>"
            "<rect x='20' y='18' width='40' height='10' rx='5' fill='#fff3c5' opacity='0.72'/>"
            "<circle cx='40' cy='46' r='12' fill='#fff7d7' stroke='#cb8a1f' stroke-width='2.6'/>"
            "<path d='M40 37 L42.8 43.4 49.6 44.2 44.5 48.8 45.9 55.6 40 52.1 34.1 55.6 35.5 48.8 30.4 44.2 37.2 43.4 Z' fill='#f2b933'/>"
            "</svg>"
        )
        return self._svg_data_uri(svg)

    def _organic_fertilizer_icon(self) -> str:
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>"
            "<defs><linearGradient id='g2' x1='0' y1='0' x2='0' y2='1'>"
            "<stop offset='0%' stop-color='#9be17a'/><stop offset='100%' stop-color='#4fae46'/>"
            "</linearGradient></defs>"
            "<rect x='14' y='10' width='52' height='60' rx='12' fill='url(#g2)' stroke='#2f7d2a' stroke-width='3'/>"
            "<rect x='20' y='18' width='40' height='10' rx='5' fill='#ddf8cf' opacity='0.8'/>"
            "<rect x='24' y='33' width='32' height='26' rx='6' fill='#eefbe8' stroke='#4a9a3f' stroke-width='2.4'/>"
            "<path d='M40 36.5 L42.6 42.2 48.8 43 44.1 47.1 45.3 53.3 40 50.2 34.7 53.3 35.9 47.1 31.2 43 37.4 42.2 Z' fill='#74be57'/>"
            "</svg>"
        )
        return self._svg_data_uri(svg)
