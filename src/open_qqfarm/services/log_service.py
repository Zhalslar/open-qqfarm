from __future__ import annotations

import json
import logging
import sys
import time
from collections.abc import Callable
from collections.abc import Mapping
from collections import deque
from dataclasses import asdict
from dataclasses import is_dataclass
from enum import Enum
from threading import Lock
from typing import Any

from google.protobuf.json_format import MessageToDict
from google.protobuf.message import Message as ProtobufMessage


def _to_public_attr_dict(value: Any) -> dict[str, Any] | None:
    if isinstance(value, ProtobufMessage):
        mapped = MessageToDict(value, preserving_proto_field_name=True)
        return mapped if isinstance(mapped, dict) else {"value": mapped}

    if isinstance(value, type):
        raw = value.__dict__
        mapped = {
            str(k): v
            for k, v in raw.items()
            if not str(k).startswith("_") and not callable(v)
        }
        return mapped or None

    if is_dataclass(value) and not isinstance(value, type):
        mapped = asdict(value)
        return mapped if isinstance(mapped, dict) else {"value": mapped}

    try:
        raw = vars(value)
    except TypeError:
        raw = {}
    if isinstance(raw, dict):
        mapped = {
            str(k): v
            for k, v in raw.items()
            if not str(k).startswith("_") and not callable(v)
        }
        if mapped:
            return mapped

    return None


def _normalize_field_value(value: Any, seen: set[int] | None = None) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value

    if seen is None:
        seen = set()

    guardable = isinstance(value, (Mapping, list, tuple, set, frozenset, deque))
    guardable = guardable or isinstance(value, type) or is_dataclass(value)
    guardable = guardable or isinstance(value, ProtobufMessage)
    guardable = guardable or hasattr(value, "__dict__")

    value_id: int | None = None
    added_guard = False
    if guardable:
        value_id = id(value)
        if value_id in seen:
            return "<recursive>"
        seen.add(value_id)
        added_guard = True

    try:
        if isinstance(value, Mapping):
            return {str(k): _normalize_field_value(v, seen) for k, v in value.items()}
        if isinstance(value, (list, tuple, set, frozenset, deque)):
            return [_normalize_field_value(v, seen) for v in value]

        mapped = _to_public_attr_dict(value)
        if mapped is not None:
            return _normalize_field_value(mapped, seen)
        return value
    finally:
        if added_guard and value_id is not None:
            seen.remove(value_id)


def _normalize_fields(fields: Mapping[str, Any]) -> dict[str, Any]:
    return {str(k): _normalize_field_value(v) for k, v in fields.items()}


class _ColorFormatter(logging.Formatter):
    _RESET = "\033[0m"
    _LEVEL_HEX_COLORS = {
        logging.DEBUG: "#309642",
        logging.INFO: "#06B6D4",
        logging.WARNING: "#F59E0B",
        logging.ERROR: "#EF4444",
    }

    @staticmethod
    def _hex_to_ansi(color: str) -> str:
        raw = str(color or "").strip()
        if not raw:
            return ""
        if raw.startswith("#"):
            raw = raw[1:]
        if len(raw) != 6:
            return ""
        try:
            r = int(raw[0:2], 16)
            g = int(raw[2:4], 16)
            b = int(raw[4:6], 16)
        except ValueError:
            return ""
        return f"\033[38;2;{r};{g};{b}m"

    def format(self, record: logging.LogRecord) -> str:
        text = super().format(record)
        fields = getattr(record, "fields", None)
        if fields:
            text = (
                f"{text} | "
                f"{json.dumps(fields, ensure_ascii=False, default=str, separators=(',', ':'))}"
            )
        color = self._hex_to_ansi(self._LEVEL_HEX_COLORS.get(record.levelno, ""))
        if not color:
            return text
        return f"{color}{text}{self._RESET}"


class LogService:
    _LOGGER_NAME = "open_qqfarm"
    _HANDLER_FLAG = "_qqfarm_color_handler"

    def __init__(self, max_entries: int = 200) -> None:
        self._rows: deque[dict[str, Any]] = deque(maxlen=max_entries)
        self._lock = Lock()
        self._seq = 0
        self._subscribers: dict[int, Callable[[dict[str, Any]], None]] = {}
        self._sub_id = 0
        self._logger = logging.getLogger(self._LOGGER_NAME)
        self._logger.setLevel(logging.DEBUG)
        self._logger.propagate = False
        self._ensure_handler()

    def set_max_entries(self, max_entries: int) -> None:
        cap = max(1, int(max_entries))
        with self._lock:
            current = list(self._rows)
            self._rows = deque(current[-cap:], maxlen=cap)

    def _ensure_handler(self) -> None:
        has_handler = any(
            getattr(handler, self._HANDLER_FLAG, False)
            for handler in self._logger.handlers
        )
        if has_handler:
            return

        handler = logging.StreamHandler(stream=sys.stdout)
        setattr(handler, self._HANDLER_FLAG, True)
        handler.setLevel(logging.DEBUG)
        handler.setFormatter(
            _ColorFormatter(
                "[%(asctime)s] [%(levelname)s] %(msg)s",
                datefmt="%H:%M:%S",
            ),
        )
        self._logger.addHandler(handler)

    def _log(
        self,
        level: int,
        msg: str,
        fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload_fields = _normalize_fields(dict(fields or {}))
        with self._lock:
            self._seq += 1
            row = {
                "seq": self._seq,
                "ts": int(time.time()),
                "level": logging.getLevelName(level),
                "msg": msg,
                "fields": payload_fields,
            }
            self._rows.append(row)
            subscribers = list(self._subscribers.values())

        if payload_fields:
            self._logger.log(level, msg, extra={"fields": payload_fields})
        else:
            self._logger.log(level, msg)

        for subscriber in subscribers:
            try:
                subscriber(dict(row))
            except Exception:
                continue
        return row

    def debug(
        self,
        msg: str,
        **fields: Any,
    ) -> dict[str, Any]:
        return self._log(logging.DEBUG, msg, fields)

    def info(
        self,
        msg: str,
        **fields: Any,
    ) -> dict[str, Any]:
        return self._log(logging.INFO, msg, fields)

    def warning(
        self,
        msg: str,
        **fields: Any,
    ) -> dict[str, Any]:
        return self._log(logging.WARNING, msg, fields)

    def error(
        self,
        msg: str,
        **fields: Any,
    ) -> dict[str, Any]:
        return self._log(logging.ERROR, msg, fields)

    def list(self, limit: int = 100, *, event: str = "") -> list[dict[str, Any]]:
        cap = max(1, int(limit))
        target_event = str(event or "").strip().lower()
        with self._lock:
            rows = list(self._rows)
        if target_event:
            rows = [
                row
                for row in rows
                if str(
                    row.get("event") or ((row.get("fields") or {}).get("event")) or ""
                )
                .strip()
                .lower()
                == target_event
            ]
        if cap >= len(rows):
            return rows
        return rows[-cap:]

    def clear(self) -> None:
        with self._lock:
            self._rows.clear()

    def list_since(self, seq: int, limit: int = 200) -> list[dict[str, Any]]:
        start = max(0, int(seq))
        cap = max(1, int(limit))
        with self._lock:
            rows = [row for row in self._rows if int(row.get("seq", 0)) > start]
        if len(rows) > cap:
            return rows[-cap:]
        return rows

    def subscribe(
        self, callback: Callable[[dict[str, Any]], None]
    ) -> Callable[[], None]:
        with self._lock:
            self._sub_id += 1
            sub_id = self._sub_id
            self._subscribers[sub_id] = callback

        def unsubscribe() -> None:
            with self._lock:
                self._subscribers.pop(sub_id, None)

        return unsubscribe


logger = LogService()
