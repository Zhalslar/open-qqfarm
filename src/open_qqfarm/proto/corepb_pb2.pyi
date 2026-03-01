from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

class Item(_Message):
    id: int
    count: int
    expire_time: int
    uid: int
    is_new: bool
    mutant_types: list[int]
    def __init__(
        self,
        *,
        id: int = ...,
        count: int = ...,
        expire_time: int = ...,
        uid: int = ...,
        is_new: bool = ...,
        mutant_types: Iterable[int] | None = ...,
    ) -> None: ...

class ItemBag(_Message):
    items: list[Item]
    def __init__(
        self,
        *,
        items: Iterable[Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class ItemChg(_Message):
    item: Item
    delta: int
    def __init__(
        self,
        *,
        item: Item | Mapping[str, Any] | None = ...,
        delta: int = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
