from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

class Plant(_Message):
    dry_time_sec: int
    weed_time_sec: int
    insect_time_sec: int
    ripe_time_sec: int
    ripe_fruit_id: int
    steal_plant_num: int
    dry_num: int
    weed_num: int
    insect_num: int
    def __init__(
        self,
        *,
        dry_time_sec: int = ...,
        weed_time_sec: int = ...,
        insect_time_sec: int = ...,
        ripe_time_sec: int = ...,
        ripe_fruit_id: int = ...,
        steal_plant_num: int = ...,
        dry_num: int = ...,
        weed_num: int = ...,
        insect_num: int = ...,
    ) -> None: ...

class Tags(_Message):
    is_new: bool
    is_follow: bool
    def __init__(
        self,
        *,
        is_new: bool = ...,
        is_follow: bool = ...,
    ) -> None: ...

class GameFriend(_Message):
    gid: int
    open_id: str
    name: str
    avatar_url: str
    remark: str
    level: int
    gold: int
    tags: Tags
    plant: Plant
    authorized_status: int
    def __init__(
        self,
        *,
        gid: int = ...,
        open_id: str = ...,
        name: str = ...,
        avatar_url: str = ...,
        remark: str = ...,
        level: int = ...,
        gold: int = ...,
        tags: Tags | Mapping[str, Any] | None = ...,
        plant: Plant | Mapping[str, Any] | None = ...,
        authorized_status: int = ...,
    ) -> None: ...

class GetAllRequest(_Message):
    def __init__(self) -> None: ...

class GetAllReply(_Message):
    game_friends: list[GameFriend]
    application_count: int
    def __init__(
        self,
        *,
        game_friends: Iterable[GameFriend | Mapping[str, Any]] | None = ...,
        application_count: int = ...,
    ) -> None: ...

class SyncAllRequest(_Message):
    open_ids: list[str]
    def __init__(
        self,
        *,
        open_ids: Iterable[str] | None = ...,
    ) -> None: ...

class SyncAllReply(_Message):
    game_friends: list[GameFriend]
    application_count: int
    def __init__(
        self,
        *,
        game_friends: Iterable[GameFriend | Mapping[str, Any]] | None = ...,
        application_count: int = ...,
    ) -> None: ...

class Application(_Message):
    gid: int
    time_at: int
    open_id: str
    name: str
    avatar_url: str
    level: int
    def __init__(
        self,
        *,
        gid: int = ...,
        time_at: int = ...,
        open_id: str = ...,
        name: str = ...,
        avatar_url: str = ...,
        level: int = ...,
    ) -> None: ...

class GetApplicationsRequest(_Message):
    def __init__(self) -> None: ...

class GetApplicationsReply(_Message):
    applications: list[Application]
    block_applications: bool
    def __init__(
        self,
        *,
        applications: Iterable[Application | Mapping[str, Any]] | None = ...,
        block_applications: bool = ...,
    ) -> None: ...

class AcceptFriendsRequest(_Message):
    friend_gids: list[int]
    def __init__(
        self,
        *,
        friend_gids: Iterable[int] | None = ...,
    ) -> None: ...

class AcceptFriendsReply(_Message):
    friends: list[GameFriend]
    def __init__(
        self,
        *,
        friends: Iterable[GameFriend | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class RejectFriendsRequest(_Message):
    friend_gids: list[int]
    def __init__(
        self,
        *,
        friend_gids: Iterable[int] | None = ...,
    ) -> None: ...

class RejectFriendsReply(_Message):
    def __init__(self) -> None: ...

class SetBlockApplicationsRequest(_Message):
    block: bool
    def __init__(
        self,
        *,
        block: bool = ...,
    ) -> None: ...

class SetBlockApplicationsReply(_Message):
    block: bool
    def __init__(
        self,
        *,
        block: bool = ...,
    ) -> None: ...

class FriendApplicationReceivedNotify(_Message):
    applications: list[Application]
    def __init__(
        self,
        *,
        applications: Iterable[Application | Mapping[str, Any]] | None = ...,
    ) -> None: ...

class FriendAddedNotify(_Message):
    friends: list[GameFriend]
    def __init__(
        self,
        *,
        friends: Iterable[GameFriend | Mapping[str, Any]] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
