from __future__ import annotations

import asyncio
import os
import traceback
from typing import Any

from .core import QFarmCoreAPP
from .dashboard import DashboardServer
from .services.log_service import logger

LOGO = r"""
  ___     ___    _____    _      ____    __  __
 / _ \   / _ \  |  ___|  / \    |  _ \  |  \/  |
| | | | | | | | | |_    / _ \   | |_) | | |\/| |
| |_| | | |_| | |  _|  / ___ \  |  _ <  | |  | |
 \__\_\  \__\_\ |_|   /_/   \_\ |_| \_\ |_|  |_|
"""


def _loop_exception_handler(
    _: asyncio.AbstractEventLoop, context: dict[str, Any]
) -> None:
    message = str(context.get("message") or "事件循环未处理异常")
    exc = context.get("exception")
    fields: dict[str, Any] = {"message": message}

    for key in ("handle", "future", "task", "transport", "protocol", "socket"):
        value = context.get(key)
        if value is not None:
            fields[key] = str(value)

    if isinstance(exc, BaseException):
        fields["error_type"] = type(exc).__name__
        fields["error"] = str(exc)
        fields["traceback"] = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        ).strip()
    elif exc is not None:
        fields["error"] = repr(exc)

    if isinstance(exc, ConnectionResetError):
        logger.error("检测到网络连接被重置", **fields)
        return
    logger.error("事件循环未处理异常", **fields)


async def _run() -> int:
    logger.info(LOGO)
    asyncio.get_running_loop().set_exception_handler(_loop_exception_handler)
    app = QFarmCoreAPP()
    host = str(os.getenv("QQFARM_DASHBOARD_HOST", "127.0.0.1"))
    port = int(str(os.getenv("QQFARM_DASHBOARD_PORT", "5173")))
    dashboard = DashboardServer(app, host=host, port=port)
    try:
        await app.start()
        await dashboard.start()
        logger.info("open_qqfarm 正在运行，按 Ctrl+C 停止")
        await asyncio.Event().wait()
        return 0
    finally:
        await dashboard.stop()
        await app.stop()


def main() -> int:
    try:
        return asyncio.run(_run())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
