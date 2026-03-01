@echo off
setlocal

if "%PYTHON%"=="" set "PYTHON=python"
set "ROOT_DIR=%~dp0"
set "VENV_DIR=%ROOT_DIR%.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"

cd /d "%ROOT_DIR%"

if not exist "%VENV_PYTHON%" (
    echo [open-qqfarm] Creating virtual environment: "%VENV_DIR%"
    %PYTHON% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [open-qqfarm] Failed to create virtual environment.
        exit /b 1
    )
)

"%VENV_PYTHON%" -c "import open_qqfarm" >nul 2>&1
if errorlevel 1 (
    echo [open-qqfarm] Installing project into virtual environment...
    "%VENV_PYTHON%" -m pip --disable-pip-version-check install -e .
    if errorlevel 1 (
        echo [open-qqfarm] Failed to install project dependencies.
        exit /b 1
    )
)

"%VENV_PYTHON%" run.py %*
