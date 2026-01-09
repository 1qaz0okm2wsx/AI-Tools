@echo off
echo 正在启动AI模型管理工具...
echo.

:: 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未检测到Node.js，请先安装Node.js
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

:: 检查依赖是否安装
if not exist node_modules (
    echo 正在安装依赖包...
    npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo 依赖安装完成！
    echo.
)

:: 启动应用
echo 启动应用服务器...
echo 应用将在浏览器中打开：http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo.

:: 等待2秒后自动打开浏览器
timeout /t 2 /nobreak >nul
start http://localhost:3000

:: 启动应用
npm start
