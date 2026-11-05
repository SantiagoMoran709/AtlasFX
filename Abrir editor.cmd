@echo off
setlocal
set "ATLASFX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%ATLASFX_NODE%" (
  "%ATLASFX_NODE%" "%~dp0scripts\start.mjs"
) else (
  node "%~dp0scripts\start.mjs"
)
if errorlevel 1 pause
