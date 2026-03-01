from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

from . import corepb_pb2

class Task(_Message):
    id: int
    progress: int
    is_claimed: bool
    is_unlocked: bool
    rewards: list[corepb_pb2.Item]
    total_progress: int
    share_multiple: int
    params: list[str]
    desc: str
    task_type: int
    group: int
    cond_type: int
    is_show_text: int
    def __init__(
        self,
        *,
        id: int = ...,
        progress: int = ...,
        is_claimed: bool = ...,
        is_unlocked: bool = ...,
        rewards: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        total_progress: int = ...,
        share_multiple: int = ...,
        params: Iterable[str] | None = ...,
        desc: str = ...,
        task_type: int = ...,
        group: int = ...,
        cond_type: int = ...,
        is_show_text: int = ...,
    ) -> None: ...

class ActiveReward(_Message):
    point_id: int
    need_progress: int
    status: int
    rewards: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        point_id: int = ...,
        need_progress: int = ...,
        status: int = ...,
        rewards: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class Active(_Message):
    type: int
    progress: int
    rewards: list[ActiveReward]
    def __init__(
        self,
        *,
        type: int = ...,
        progress: int = ...,
        rewards: Iterable[ActiveReward | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class TaskInfo(_Message):
    growth_tasks: list[Task]
    daily_tasks: list[Task]
    tasks: list[Task]
    actives: list[Active]
    def __init__(
        self,
        *,
        growth_tasks: Iterable[Task | Mapping[str, Any]] | None = ...,
        daily_tasks: Iterable[Task | Mapping[str, Any]] | None = ...,
        tasks: Iterable[Task | Mapping[str, Any]] | None = ...,
        actives: Iterable[Active | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class TaskInfoRequest(_Message):
    def __init__(self) -> None: ...

class TaskInfoReply(_Message):
    task_info: TaskInfo
    def __init__(
        self,
        *,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

class ClaimTaskRewardRequest(_Message):
    id: int
    do_shared: bool
    def __init__(
        self,
        *,
        id: int = ...,
        do_shared: bool = ...,
    ) -> None: ...

class ClaimTaskRewardReply(_Message):
    items: list[corepb_pb2.Item]
    task_info: TaskInfo
    compensated_items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
        compensated_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class BatchClaimTaskRewardRequest(_Message):
    ids: list[int]
    do_shared: bool
    def __init__(
        self,
        *,
        ids: Iterable[int] | None = ...,
        do_shared: bool = ...,
    ) -> None: ...

class BatchClaimTaskRewardReply(_Message):
    items: list[corepb_pb2.Item]
    task_info: TaskInfo
    compensated_items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
        compensated_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class ClaimDailyRewardRequest(_Message):
    type: int
    point_ids: list[int]
    def __init__(
        self,
        *,
        type: int = ...,
        point_ids: Iterable[int] | None = ...,
    ) -> None: ...

class ClaimDailyRewardReply(_Message):
    items: list[corepb_pb2.Item]
    task_info: TaskInfo
    compensated_items: list[corepb_pb2.Item]
    def __init__(
        self,
        *,
        items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
        compensated_items: Iterable[corepb_pb2.Item | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class ClientReportProgressRequest(_Message):
    task_id: int
    progress: int
    def __init__(
        self,
        *,
        task_id: int = ...,
        progress: int = ...,
    ) -> None: ...

class ClientReportProgressReply(_Message):
    task_info: TaskInfo
    def __init__(
        self,
        *,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

class TaskInfoNotify(_Message):
    task_info: TaskInfo
    def __init__(
        self,
        *,
        task_info: TaskInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
