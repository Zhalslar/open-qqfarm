from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

from . import corepb_pb2

class ItemNotify(_Message):
    items: list[corepb_pb2.ItemChg]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.ItemChg | Mapping[str, Any]] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
