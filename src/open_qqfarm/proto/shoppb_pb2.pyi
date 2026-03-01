from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

from . import corepb_pb2

class ShopProfile(_Message):
    shop_id: int
    shop_name: str
    shop_type: int
    def __init__(
        self,
        *,
        shop_id: int = ...,
        shop_name: str = ...,
        shop_type: int = ...,
    ) -> None: ...

class GoodsInfo(_Message):
    id: int
    bought_num: int
    price: int
    limit_count: int
    unlocked: bool
    item_id: int
    item_count: int
    conds: list[Cond]
    def __init__(
        self,
        *,
        id: int = ...,
        bought_num: int = ...,
        price: int = ...,
        limit_count: int = ...,
        unlocked: bool = ...,
        item_id: int = ...,
        item_count: int = ...,
        conds: Iterable[Cond | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class Cond(_Message):
    type: int
    param: int
    def __init__(
        self,
        *,
        type: int = ...,
        param: int = ...,
    ) -> None: ...

class ShopProfilesRequest(_Message):
    def __init__(self) -> None: ...

class ShopProfilesReply(_Message):
    shop_profiles: list[ShopProfile]
    def __init__(
        self,
        *,
        shop_profiles: Iterable[ShopProfile | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class ShopInfoRequest(_Message):
    shop_id: int
    def __init__(
        self,
        *,
        shop_id: int = ...,
    ) -> None: ...

class ShopInfoReply(_Message):
    goods_list: list[GoodsInfo]
    def __init__(
        self,
        *,
        goods_list: Iterable[GoodsInfo | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class BuyGoodsRequest(_Message):
    goods_id: int
    num: int
    price: int
    def __init__(
        self,
        *,
        goods_id: int = ...,
        num: int = ...,
        price: int = ...,
    ) -> None: ...

class BuyGoodsReply(_Message):
    goods: GoodsInfo
    get_items: list[corepb_pb2.Item]
    cost_items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        goods: GoodsInfo | Mapping[str, Any] | None = ...,
        get_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        cost_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class GoodsUnlockNotify(_Message):
    goods_list: list[GoodsInfo]
    def __init__(
        self,
        *,
        goods_list: Iterable[GoodsInfo | Mapping[str, Any]] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
