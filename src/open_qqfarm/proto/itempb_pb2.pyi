from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

from . import corepb_pb2

class BagRequest(_Message):
    def __init__(self) -> None: ...

class BagReply(_Message):
    item_bag: corepb_pb2.ItemBag
    def __init__(
        self,
        *,
        item_bag: corepb_pb2.ItemBag | Mapping[str, Any] | None = ...,
    ) -> None: ...

class SellRequest(_Message):
    items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class SellReply(_Message):
    sell_items: list[corepb_pb2.Item]
    get_items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        sell_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        get_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class UseRequest(_Message):
    item_id: int
    count: int
    land_ids: list[int]
    def __init__(
        self,
        *,
        item_id: int = ...,
        count: int = ...,
        land_ids: Iterable[int] | None = ...,
    ) -> None: ...

class UseReply(_Message):
    items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class UseItem(_Message):
    item_id: int
    count: int
    def __init__(
        self,
        *,
        item_id: int = ...,
        count: int = ...,
    ) -> None: ...

class BatchUseRequest(_Message):
    items: list[UseItem]
    def __init__(
        self,
        *,
        items: Iterable[UseItem | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class BatchUseReply(_Message):
    items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
