from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

from . import plantpb_pb2, userpb_pb2

class EnterRequest(_Message):
    host_gid: int
    reason: int
    def __init__(
        self,
        *,
        host_gid: int = ...,
        reason: int = ...,
    ) -> None: ...

class EnterReply(_Message):
    basic: userpb_pb2.BasicInfo
    lands: list[plantpb_pb2.LandInfo]
    def __init__(
        self,
        *,
        basic: userpb_pb2.BasicInfo | Mapping[str, Any] | None = ...,
        lands: Iterable[plantpb_pb2.LandInfo | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class LeaveRequest(_Message):
    host_gid: int
    def __init__(
        self,
        *,
        host_gid: int = ...,
    ) -> None: ...

class LeaveReply(_Message):
    def __init__(self) -> None: ...

def __getattr__(name: str) -> Any: ...
