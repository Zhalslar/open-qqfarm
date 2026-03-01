from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..models import ItemInfo, Plant, SeedInfo
from ..config import CoreConfig
from .log_service import logger


class GameDataService:
    def __init__(self, config: CoreConfig):
        self.cfg = config
        self.data_dir = self.cfg.game_data_dir
        self.seed_image_dir = self.data_dir / "seed_images_named"
        self.item_info_file = self.data_dir / "item_info.json"
        self.plant_file = self.data_dir / "plant.json"
        self.role_level_file = self.data_dir / "role_level.json"

        self.role_level: dict[int, int] = {}
        self.level_exp_table: dict[int, int] = {}

        self.plants: list[Plant] = []
        self.plant_by_id: dict[int, Plant] = {}
        self.plant_by_seed: dict[int, Plant] = {}
        self.plant_by_fruit: dict[int, Plant] = {}

        self.item_info: list[ItemInfo] = []
        self.item_by_id: dict[int, ItemInfo] = {}
        self.seed_item_by_id: dict[int, ItemInfo] = {}

        self.seed_image_by_id: dict[int, str] = {}
        self.seed_image_by_asset: dict[str, str] = {}

        self._load()

    def _load(self):
        self._load_role_level()
        self._load_plants()
        self._load_items()
        self._load_seed_images()
        logger.info(
            "游戏配置数据加载完成",
            role_level_count=len(self.role_level),
            plant_count=len(self.plants),
            item_count=len(self.item_info),
            seed_image_count=len(self.seed_image_by_id),
        )

    @staticmethod
    def _read_json(path: Path, default: Any) -> Any:
        try:
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("读取游戏配置失败，使用默认值", path=str(path), error=str(e))
            return default

    def _load_role_level(self):
        raw_role_level: dict[str, int] = self._read_json(self.role_level_file, {})
        self.role_level = {}
        for level, exp in raw_role_level.items():
            level_int = int(level)
            if level_int <= 0:
                continue
            self.role_level[level_int] = int(exp)
        self.level_exp_table = dict(self.role_level)

    def _load_plants(self):
        raw_plants: list[dict[str, Any]] = self._read_json(self.plant_file, [])
        self.plants = [Plant.from_dict(plant) for plant in raw_plants]
        for plant in self.plants:
            self.plant_by_id[plant.id] = plant
            self.plant_by_seed[plant.seed_id] = plant
            self.plant_by_fruit[plant.fruit_id] = plant

    def _load_items(self):
        raw_items: list[dict[str, Any]] = self._read_json(self.item_info_file, [])
        self.item_info = [ItemInfo.from_dict(item) for item in raw_items]
        for item in self.item_info:
            item_id = item.id
            if item_id <= 0:
                continue
            self.item_by_id[item_id] = item
            if item.is_seed:
                self.seed_item_by_id[item_id] = item

    def _load_seed_images(self):
        for path in self.seed_image_dir.iterdir():
            if not path.is_file():
                continue
            name = path.name
            url = f"/game-config/seed_images_named/{name}"
            parts = name.split("_", 1)
            if parts and parts[0].isdigit():
                seed_id = int(parts[0])
                self.seed_image_by_id.setdefault(seed_id, url)
            if "Crop_" in name and "_Seed" in name:
                start = name.find("Crop_")
                end = name.find("_Seed", start)
                if start >= 0 and end > start:
                    asset = name[start:end]
                    self.seed_image_by_asset.setdefault(asset, url)

    def get_seed_unlock_level(self, seed_id: int) -> int:
        item = self.seed_item_by_id.get(int(seed_id))
        return item.level if item else 1

    def get_seed_price(self, seed_id: int) -> int:
        item = self.seed_item_by_id.get(int(seed_id))
        return item.price if item else 0

    def get_fruit_price(self, fruit_id: int) -> int:
        item = self.item_by_id.get(int(fruit_id))
        return item.price if item else 0

    def get_item_by_id(self, item_id: int) -> ItemInfo | None:
        return self.item_by_id.get(int(item_id))

    def get_fruit_name(self, fruit_id: int) -> str:
        plant = self.plant_by_fruit.get(int(fruit_id))
        if plant:
            return plant.name
        item = self.item_by_id.get(int(fruit_id))
        if item and item.name:
            return item.name
        return f"Fruit{fruit_id}"

    def get_plant_by_fruit(self, fruit_id: int) -> Plant | None:
        return self.plant_by_fruit.get(int(fruit_id))

    def is_fruit_item(self, fruit_id: int) -> bool:
        return self.get_plant_by_fruit(fruit_id) is not None

    def get_plant_exp(self, plant_id: int) -> int:
        plant = self.plant_by_id.get(int(plant_id))
        return plant.exp if plant else 0

    def get_plant_grow_time_sec(self, plant_id: int) -> int:
        plant = self.plant_by_id.get(int(plant_id))
        return plant.grow_time_sec if plant else 0

    def get_seed_image(self, seed_id: int) -> str:
        return self.seed_image_by_id.get(int(seed_id), "")

    def get_plant_by_seed(self, seed_id: int) -> Plant | None:
        return self.plant_by_seed.get(int(seed_id))

    def get_plant_name_by_seed(self, seed_id: int) -> str:
        plant = self.get_plant_by_seed(seed_id)
        return plant.name if plant else f"种子{seed_id}"

    def get_plant_name(self, plant_id: int) -> str:
        plant = self.plant_by_id.get(int(plant_id))
        return plant.name if plant else f"植物{plant_id}"

    def get_seed_id_by_plant(self, plant_id: int) -> int:
        plant = self.plant_by_id.get(int(plant_id))
        return plant.seed_id if plant else 0

    def get_all_seeds(self, current_level: int) -> list[SeedInfo]:
        _ = current_level
        rows: list[SeedInfo] = []
        for plant in self.plants:
            rows.append(
                SeedInfo(
                    seed_id=plant.seed_id,
                    name=plant.name,
                    required_level=plant.land_level_need,
                    price=self.get_seed_price(plant.seed_id),
                    image=self.get_seed_image(plant.seed_id),
                )
            )
        rows.sort(key=lambda x: (x.required_level, x.seed_id))
        return rows
