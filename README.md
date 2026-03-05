# 已弃坑， 不想玩了， 不好玩

# open-qqfarm

QQ 农场网页版客户端完整实现+自动化模块


![8ea15276c19a7e00a23549fcea48c339](https://github.com/user-attachments/assets/db55e881-37fa-4aef-b521-87e9fae200ec)

## 当前状态

- 版本：`0.1.0`
- Python：`>=3.10`
- 包名：`open-qqfarm`
- 导入名：`open_qqfarm`

## 安装

```bash
pip install open-qqfarm(目前还没发包， 下载压缩包来使用吧)
```

本地开发：

```bash
pip install -e ".[dev]"
```

## 运行入口

```bash
open-qqfarm
```

等价方式：

```bash
python run.py
python -m open_qqfarm
```

Windows 可用引导脚本：

```bash
start.bat
```

`start.bat` 会自动创建 `.venv`、安装项目并启动。

## 核心能力

- 登录：二维码登录、轮询状态、自动刷新二维码。
- 自动化：独立循环调度自家农场与好友农场。
- 自家农场动作：`weed` `insect` `water` `harvest` `sell` `remove` `unlock` `upgrade` `plant` `normal_fertilize` `organic_fertilize`。
- 好友农场动作：`steal` `help_water` `help_weed` `help_insect` `put_insect` `put_weed`。
- 通知处理：地块推送、背包推送、任务推送、好友申请推送、基础信息推送、踢下线推送。

## 配置

仓库中的默认配置模板位于 `src/open_qqfarm/default_config.json`，安装后对应包内 `open_qqfarm/default_config.json`。根目录 `config.json` 提供了同结构示例。

默认配置结构：

```json
{
  "account": {
    "uin": "",
    "auth_code": ""
  },
  "farm": {
    "enable_auto": true,
    "actions": [
      "weed",
      "insect",
      "water",
      "harvest",
      "sell",
      "remove",
      "unlock",
      "upgrade",
      "plant"
    ],
    "base_minute": 5,
    "harvest_sell": true,
    "seed_mode": "preferred_id",
    "preferred_seed_id": 20002,
    "normal_fertilize": false,
    "organic_fertilize": false
  },
  "friend": {
    "enable_auto": true,
    "actions": [
      "steal",
      "help_water",
      "help_weed",
      "help_insect"
    ],
    "base_minute": 60,
    "put_insect_count": 1,
    "put_weed_count": 1,
    "whitelist": [],
    "blacklist": [],
    "steal": true,
    "help": true,
    "bad": false
  },
  "notify": {
    "actions": [
      "LandsNotify",
      "ItemNotify",
      "TaskInfoNotify",
      "FriendApplicationReceivedNotify",
      "BasicNotify",
      "Kickout"
    ]
  },
  "auto_reward": true,
  "client": {
    "client_version": "1.6.0.5_20251224",
    "appid": "1112386029",
    "platform": "qq",
    "os": "iOS",
    "sys_software": "iOS 26.2.1",
    "network": "wifi",
    "memory": 7672,
    "device_id": "iPhone X<iPhone18,3>"
  },
  "user_heartbeat": 30,
  "ws_heartbeat": 30,
  "rpc_timeout": 25,
  "step_interval": 0.2
}
```

`farm.seed_mode` 支持：

- `preferred_id`
- `max_exp`
- `max_fert_exp`
- `max_profit`
- `max_fert_profit`
- `max_item_id`

## API 示例

```python
import asyncio
import json
from pathlib import Path

from open_qqfarm import QFarmCoreAPP


async def notify(msg: str) -> None:
    print(msg)


async def main() -> None:
    config = json.loads(Path("config.json").read_text(encoding="utf-8"))
    app = QFarmCoreAPP(config)

    await app.start_login(notify)
    await app.start()

    lands = await app.get_all_lands()
    print(f"lands={len(lands)}")

    await app.do_farm_all()
    await app.stop()


asyncio.run(main())
```

## 发布前检查

- 确认配置文件无真实 `uin/auth_code`。
- 运行测试：`python -m pytest -q`
- 构建分发包：`python -m build`
- 检查包内容：`tar -tf dist/*.tar.gz`

## License

`LGPL-2.1-or-later`
