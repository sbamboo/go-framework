@echo off
setlocal

REM Validate argument
if "%1"=="" (
    echo Usage: build.bat [tui^|gui]
    exit /b 1
)

if /I not "%1"=="tui" if /I not "%1"=="gui" (
    echo Invalid target: %1
    echo Usage: build.bat [tui^|gui]
    exit /b 1
)

set TARGET=%1

pwsh -ExecutionPolicy Bypass -File ".\build.ps1" -semver 0.0.0 -uind 0 -channel dev -notes "WORKSPACE (dev)" -auto -noCrossCompile -withDebugger -deployURL "_" -t %TARGET% -doDebugLdflags -appName "mcc-app_%TARGET%"

endlocal