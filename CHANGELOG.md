# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added console entrypoint `open-qqfarm` (`open_qqfarm.cli:main`).
- Added `python -m open_qqfarm` support via `open_qqfarm.__main__`.

### Changed

- Updated README to match current code behavior and config schema.
- Updated sample `config.json` to align with the active runtime schema.
- Sanitized default account credentials in `src/open_qqfarm/default_config.json`.
- Included `default_config.json` in package data for distribution builds.

### Removed

- Removed accidental temporary files `%T%` and `tmp_log_test.py)`.

## [0.1.0] - 2026-02-27

### Added

- Added standalone packaging metadata for PyPI release.
- Added release documentation and publish workflow skeleton.
- Added basic import/config test coverage.

### Changed

- Migrated package directory from `open-qqfarm` to `open_qqfarm` for valid Python imports.
- Removed AstrBot runtime dependency and switched to standard `logging`.
- Reworked repository files for independent Python package publishing.
