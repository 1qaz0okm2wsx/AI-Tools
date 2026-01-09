@echo off
chcp 936 >nul
echo.
echo ============================================
echo           重启服务工具
echo ============================================
echo.

echo [步骤 1] 停止占用端口 3000 的进程...
netstat -ano | findstr ":3000" | findstr "LISTENING"
if %errorlevel% equ 0 (
    echo 找到占用端口的进程，正在停止...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
        echo   - 停止进程 PID: %%a
        taskkill /f /pid %%a >nul 2>&1
    )
    echo   端口已释放
) else (
    echo   - 端口 3000 未被占用
)
echo.

echo [步骤 2] 等待 2 秒...
timeout /t 2 /nobreak >nul
echo.

echo [步骤 3] 检查端口状态...
netstat -ano | findstr ":3000" | findstr "LISTENING"
if %errorlevel% equ 0 (
    echo   - 警告: 端口仍被占用
    echo.
    echo 请手动执行以下命令:
    echo   1. 按 Ctrl+Shift+Esc 打开任务管理器
    echo   2. 找到 node.exe 进程并结束
    echo   3. 或者运行: taskkill /f /im node.exe
    echo.
    pause
    exit /b 1
) else (
    echo   - 端口 3000 已空闲
)
echo.

echo ============================================
echo           启动 AI 模型管理工具
echo ============================================
echo.

:: 检查Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found
    echo Please install: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查依赖
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo ============================================
echo  服务地址: http://localhost:3000
echo  仪表盘: http://localhost:3000/dashboard
echo  浏览器: http://localhost:3000/browser
echo ============================================
echo.
echo 按任意键启动服务...
pause >nul

:: 打开浏览器
start http://localhost:3000

:: 启动服务
echo.
node index.js

if %errorlevel% neq 0 (
    echo.
    echo ============================================
    echo   ERROR: 服务启动失败
    echo ============================================
    echo.
    pause
)
