from __future__ import annotations

import asyncio

from .core import QFarmCoreAPP
from .services.log_service import logger

LOGO = r"""
  ___     ___    _____    _      ____    __  __
 / _ \   / _ \  |  ___|  / \    |  _ \  |  \/  |
| | | | | | | | | |_    / _ \   | |_) | | |\/| |
| |_| | | |_| | |  _|  / ___ \  |  _ <  | |  | |
 \__\_\  \__\_\ |_|   /_/   \_\ |_| \_\ |_|  |_|
"""


async def _run() -> int:
    logger.info(LOGO)
    app = QFarmCoreAPP()
    try:
        await app.start()
        logger.info("open_qqfarm 正在运行，按 Ctrl+C 停止")
        await asyncio.Event().wait()
        return 0
    finally:
        await app.stop()


def main() -> int:
    try:
        return asyncio.run(_run())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
