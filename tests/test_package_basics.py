import json
from importlib import resources

from open_qqfarm import __version__
from open_qqfarm.config import CoreConfig


def test_version_available() -> None:
    assert isinstance(__version__, str)
    assert __version__


def test_core_config_defaults() -> None:
    cfg = CoreConfig()
    assert cfg.farm.base_minute > 0
    assert cfg.friend.base_minute > 0


def test_default_config_packaged_and_sanitized() -> None:
    text = resources.files("open_qqfarm").joinpath("default_config.json").read_text(
        encoding="utf-8"
    )
    data = json.loads(text)
    assert data["account"]["uin"] == ""
    assert data["account"]["auth_code"] == ""
    assert "actions" in data["farm"]
    assert "actions" in data["friend"]
