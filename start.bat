@echo off
chcp 65001 >nul
echo.
echo ============================================
echo        AI模型管理工具 - 启动器
echo ============================================
echo.

:: 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：未检测到Node.js
    echo.
    echo 请先下载并安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
node --version
echo.

:: 检查依赖是否安装
if not exist node_modules (
    echo 📦 正在安装依赖包...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ❌ 依赖安装失败，请检查网络连接
        echo.
        pause
        exit /b 1
    )
    echo.
    echo ✅ 依赖安装完成！
    echo.
) else (
    echo ✅ 依赖已安装
    echo.
)

:: 启动应用
echo ============================================
echo 正在启动应用服务器...
echo ============================================
echo.
echo 📍 服务地址: http://localhost:3000
echo 📊 仪表盘: http://localhost:3000/dashboard
echo 🌐 浏览器自动化: http://localhost:3000/browser
echo.
echo 按 Ctrl+C 停止服务器
echo.
pause

:: 等待服务启动后自动打开浏览器
start /B timeout /t 3 /nobreak >nul && start http://localhost:3000

:: 启动应用
echo.
call npm start

:: 如果服务意外退出，暂停窗口
if %errorlevel% neq 0 (
    echo.
    echo ============================================
    echo ❌ 服务已停止 (错误代码: %errorlevel%)
    echo ============================================
    echo.
    echo 请检查上方错误信息
    echo.
    pause
)
