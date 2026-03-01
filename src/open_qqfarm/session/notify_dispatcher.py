from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable

NotifyHandler = Callable[[str, bytes], Awaitable[None] | None]


class NotifyDispatcher:
    def __init__(self):
        self._handlers: dict[str, list[NotifyHandler]] = defaultdict(list)
        self._wildcard_handlers: list[NotifyHandler] = []
        self._lock = asyncio.Lock()

    async def on(self, message_type: str, handler: NotifyHandler) -> None:
        async with self._lock:
            if message_type == "*":
                if handler not in self._wildcard_handlers:
                    self._wildcard_handlers.append(handler)
            else:
                key = str(message_type)
                if handler not in self._handlers[key]:
                    self._handlers[key].append(handler)

    async def off(self, message_type: str, handler: NotifyHandler) -> None:
        async with self._lock:
            if message_type == "*":
                self._wildcard_handlers = [
                    h for h in self._wildcard_handlers if h is not handler
                ]
                return
            key = str(message_type)
            handlers = self._handlers.get(key, [])
            self._handlers[key] = [h for h in handlers if h is not handler]

    async def emit(self, message_type: str, payload: bytes) -> None:
        async with self._lock:
            handlers = list(self._handlers.get(message_type, []))
            handlers.extend(self._wildcard_handlers)
        for handler in handlers:
            try:
                ret = handler(message_type, payload)
                if asyncio.iscoroutine(ret):
                    await ret
            except Exception:
                continue

    async def clear(self) -> None:
        async with self._lock:
            self._handlers.clear()
            self._wildcard_handlers.clear()
