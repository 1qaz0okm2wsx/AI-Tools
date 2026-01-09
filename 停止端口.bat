@echo off
chcp 936 >nul
echo.
echo ============================================
echo              停止端口 3000 的工具
echo ============================================
echo.

:: Find and kill processes using port 3000
echo 正在查找占用端口的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   - 停止进程 PID: %%a
    taskkill /f /pid %%a >nul 2>&1
    if %errorlevel% equ 0 (
        echo   - 进程已停止
    ) else (
        echo   - 停止失败，错误代码: %errorlevel%
    )
)
echo.
echo ============================================
echo 完成！现在可以重新启动服务
echo ============================================
echo.
pause
