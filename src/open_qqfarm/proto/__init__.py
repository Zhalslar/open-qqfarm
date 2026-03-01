"""Generated protobuf modules for qfarm protocol.

This package re-exports generated ``*_pb2`` modules and all message classes.
"""

from types import ModuleType

from google.protobuf.message import Message as _ProtobufMessage

from . import (
    corepb_pb2,
    friendpb_pb2,
    game_pb2,
    itempb_pb2,
    notifypb_pb2,
    plantpb_pb2,
    shoppb_pb2,
    taskpb_pb2,
    userpb_pb2,
    visitpb_pb2,
)

_PROTO_MODULES: tuple[ModuleType, ...] = (
    corepb_pb2,
    friendpb_pb2,
    game_pb2,
    itempb_pb2,
    notifypb_pb2,
    plantpb_pb2,
    shoppb_pb2,
    taskpb_pb2,
    userpb_pb2,
    visitpb_pb2,
)

_PROTO_MODULE_EXPORTS = [
    "corepb_pb2",
    "friendpb_pb2",
    "game_pb2",
    "itempb_pb2",
    "notifypb_pb2",
    "plantpb_pb2",
    "shoppb_pb2",
    "taskpb_pb2",
    "userpb_pb2",
    "visitpb_pb2",
]

_PROTO_CLASS_EXPORTS: list[str] = []
for _module in _PROTO_MODULES:
    for _name, _obj in vars(_module).items():
        if _name.startswith("_"):
            continue
        if isinstance(_obj, type) and issubclass(_obj, _ProtobufMessage):
            globals()[_name] = _obj
            _PROTO_CLASS_EXPORTS.append(_name)

__all__ = _PROTO_MODULE_EXPORTS + _PROTO_CLASS_EXPORTS
