from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from google.protobuf.message import Message as _Message

class Meta(_Message):
    service_name: str
    method_name: str
    message_type: int
    client_seq: int
    server_seq: int
    error_code: int
    error_message: str
    metadata: dict[str, bytes]
    def __init__(
        self,
        *,
        service_name: str = ...,
        method_name: str = ...,
        message_type: int = ...,
        client_seq: int = ...,
        server_seq: int = ...,
        error_code: int = ...,
        error_message: str = ...,
        metadata: Mapping[str, bytes] | None = ...,
    ) -> None: ...

class Message(_Message):
    meta: Meta
    body: bytes
    def __init__(
        self,
        *,
        meta: Meta | Mapping[str, Any] | None = ...,
        body: bytes = ...,
    ) -> None: ...

class EventMessage(_Message):
    message_type: str
    body: bytes
    def __init__(
        self,
        *,
        message_type: str = ...,
        body: bytes = ...,
    ) -> None: ...

class KickoutNotify(_Message):
    reason: int
    reason_message: str
    def __init__(
        self,
        *,
        reason: int = ...,
        reason_message: str = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
