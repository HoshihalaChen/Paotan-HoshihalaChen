@echo off
chcp 65001 >nul
title 跑团助手 - TRPG Manager

echo ═══════════════════════════════════════
echo   跑团助手 v0.0.2-Beta
echo   TRPG Manager
echo ═══════════════════════════════════════
echo.
echo 正在尝试启动本地服务器...

:: 方法1: 尝试 Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [✓] 使用 Python 启动服务器
    echo.
    echo ═══════════════════════════════════════
    echo   浏览器访问: http://localhost:8080
    echo   关闭此窗口即可停止服务器
    echo ═══════════════════════════════════════
    start http://localhost:8080
    python -m http.server 8080
    goto :end
)

:: 方法2: 尝试 npx (Node.js)
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [✓] 使用 Node.js 启动服务器
    start http://localhost:8080
    npx serve -l 8080 .
    goto :end
)

:: 方法3: 无可用工具
echo [✗] 未检测到 Python 或 Node.js
echo.
echo 请安装以下任一工具后重新运行：
echo   1. Python 3: https://www.python.org/downloads/
echo   2. Node.js:  https://nodejs.org/
echo.
echo 或直接将此文件夹发送给有 Python 的朋友。
echo.
pause
goto :end

:end
