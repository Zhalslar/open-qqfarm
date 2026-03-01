from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from google.protobuf.message import Message as _Message

class LoginRequest(_Message):
    sharer_id: int
    sharer_open_id: str
    device_info: DeviceInfo
    share_cfg_id: int
    scene_id: str
    report_data: ReportData
    def __init__(
        self,
        *,
        sharer_id: int = ...,
        sharer_open_id: str = ...,
        device_info: DeviceInfo | Mapping[str, Any] | None = ...,
        share_cfg_id: int = ...,
        scene_id: str = ...,
        report_data: ReportData | Mapping[str, Any] | None = ...,
    ) -> None: ...

class DeviceInfo(_Message):
    client_version: str
    sys_software: str
    sys_hardware: str
    telecom_oper: str
    network: str
    screen_width: int
    screen_height: int
    density: float
    cpu: str
    memory: int
    gl_render: str
    gl_version: str
    device_id: str
    android_oaid: str
    ios_caid: str
    def __init__(
        self,
        *,
        client_version: str = ...,
        sys_software: str = ...,
        sys_hardware: str = ...,
        telecom_oper: str = ...,
        network: str = ...,
        screen_width: int = ...,
        screen_height: int = ...,
        density: float = ...,
        cpu: str = ...,
        memory: int = ...,
        gl_render: str = ...,
        gl_version: str = ...,
        device_id: str = ...,
        android_oaid: str = ...,
        ios_caid: str = ...,
    ) -> None: ...

class ReportData(_Message):
    callback: str
    cd_extend_info: str
    click_id: str
    clue_token: str
    minigame_channel: str
    minigame_platid: int
    req_id: str
    trackid: str
    def __init__(
        self,
        *,
        callback: str = ...,
        cd_extend_info: str = ...,
        click_id: str = ...,
        clue_token: str = ...,
        minigame_channel: str = ...,
        minigame_platid: int = ...,
        req_id: str = ...,
        trackid: str = ...,
    ) -> None: ...

class LoginReply(_Message):
    basic: BasicInfo
    time_now_millis: int
    is_first_login: bool
    qq_group_infos: list[QQGroupInfo]
    version_info: VersionInfo
    qq_friend_recommend_authorized: int
    def __init__(
        self,
        *,
        basic: BasicInfo | Mapping[str, Any] | None = ...,
        time_now_millis: int = ...,
        is_first_login: bool = ...,
        qq_group_infos: Iterable[QQGroupInfo | Mapping[str, Any]] | None = ...,
        version_info: VersionInfo | Mapping[str, Any] | None = ...,
        qq_friend_recommend_authorized: int = ...,
    ) -> None: ...

class BasicInfo(_Message):
    gid: int
    name: str
    level: int
    exp: int
    gold: int
    open_id: str
    avatar_url: str
    remark: str
    signature: str
    gender: int
    authorized_status: int
    disable_nudge: bool
    def __init__(
        self,
        *,
        gid: int = ...,
        name: str = ...,
        level: int = ...,
        exp: int = ...,
        gold: int = ...,
        open_id: str = ...,
        avatar_url: str = ...,
        remark: str = ...,
        signature: str = ...,
        gender: int = ...,
        authorized_status: int = ...,
        disable_nudge: bool = ...,
    ) -> None: ...

class QQGroupInfo(_Message):
    qq_group_id: str
    qq_group_name: str
    def __init__(
        self,
        *,
        qq_group_id: str = ...,
        qq_group_name: str = ...,
    ) -> None: ...

class VersionInfo(_Message):
    status: int
    version_recommend: str
    version_force: str
    res_version: str
    def __init__(
        self,
        *,
        status: int = ...,
        version_recommend: str = ...,
        version_force: str = ...,
        res_version: str = ...,
    ) -> None: ...

class HeartbeatRequest(_Message):
    gid: int
    client_version: str
    def __init__(
        self,
        *,
        gid: int = ...,
        client_version: str = ...,
    ) -> None: ...

class HeartbeatReply(_Message):
    server_time: int
    version_info: VersionInfo
    def __init__(
        self,
        *,
        server_time: int = ...,
        version_info: VersionInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

class ReportArkClickRequest(_Message):
    sharer_id: int
    sharer_open_id: str
    share_cfg_id: int
    scene_id: str
    def __init__(
        self,
        *,
        sharer_id: int = ...,
        sharer_open_id: str = ...,
        share_cfg_id: int = ...,
        scene_id: str = ...,
    ) -> None: ...

class ReportArkClickReply(_Message):
    def __init__(self) -> None: ...

class BasicNotify(_Message):
    basic: BasicInfo
    def __init__(
        self,
        *,
        basic: BasicInfo | Mapping[str, Any] | None = ...,
    ) -> None: ...

def __getattr__(name: str) -> Any: ...
