@echo off
chcp 65001 >nul
echo.
echo ============================================
echo           清理缓存工具
echo ============================================
echo.

:: 检查服务是否运行
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do set SERVER_PID=%%a

if defined SERVER_PID (
    echo ⚠️  检测到服务正在运行 (PID: %SERVER_PID%)
    echo    建议先停止服务再清理缓存
    echo.
    set /p CONTINUE="是否继续清理? (Y/N): "
    if /i not "%CONTINUE%"=="Y" (
        echo 操作已取消
        pause
        exit /b 0
    )
    echo.
)

set /p CLEAN_TYPE="请选择清理类型:
echo.
echo   1. 清理 Chrome Cookie (浏览器自动化相关)
echo   2. 清理 Token 使用日志
echo   3. 清理操作日志
echo   4. 清理所有日志
echo   5. 清理 Node 缓存
echo   6. 全部清理
echo   0. 取消
echo.

choice /c 1234560 /n /m "请选择 (0-6): "
if errorlevel 7 goto all_clean
if errorlevel 6 goto node_cache
if errorlevel 5 goto all_logs
if errorlevel 4 goto operation_logs
if errorlevel 3 goto token_logs
if errorlevel 2 goto chrome_cookies
if errorlevel 1 goto cancel

:chrome_cookies
echo.
echo [1/1] 清理 Chrome Cookie...
set "COOKIES_DIR=%CD%\cookies"
if exist "%COOKIES_DIR%" (
    echo 正在删除: %COOKIES_DIR%\*
    del /q "%COOKIES_DIR%\*" 2>nul
    if exist "%COOKIES_DIR%\*" (
        rmdir /s /q "%COOKIES_DIR%" 2>nul
    )
    echo ✅ Chrome Cookie 清理完成
) else (
    echo ℹ️  Cookie 目录不存在，跳过
)
goto end

:token_logs
echo.
echo [1/1] 清理 Token 使用日志...
if exist "ai_models.db" (
    echo 正在清理 token_logs 表...
    sqlite3 ai_models.db "DELETE FROM token_logs;" 2>nul
    if not errorlevel 1 (
        echo ✅ Token 使用日志清理完成
    ) else (
        echo ⚠️  清理失败，请确保 sqlite3 可用
    )
) else (
    echo ℹ️  数据库文件不存在
)
goto end

:operation_logs
echo.
echo [1/1] 清理操作日志...
if exist "ai_models.db" (
    echo 正在清理 operation_logs 表...
    sqlite3 ai_models.db "DELETE FROM operation_logs;" 2>nul
    if not errorlevel 1 (
        echo ✅ 操作日志清理完成
    ) else (
        echo ⚠️  清理失败，请确保 sqlite3 可用
    )
) else (
    echo ℹ️  数据库文件不存在
)
goto end

:all_logs
echo.
echo [1/3] 清理 Token 使用日志...
if exist "ai_models.db" (
    sqlite3 ai_models.db "DELETE FROM token_logs;" 2>nul
    echo ✅ Token 使用日志清理完成
)

echo [2/3] 清理操作日志...
if exist "ai_models.db" (
    sqlite3 ai_models.db "DELETE FROM operation_logs;" 2>nul
    echo ✅ 操作日志清理完成
)

echo [3/3] 数据库优化...
if exist "ai_models.db" (
    sqlite3 ai_models.db "VACUUM;" 2>nul
    echo ✅ 数据库优化完成
)

goto end

:node_cache
echo.
echo [1/1] 清理 Node 缓存...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo ✅ Node 缓存清理完成
) else (
    echo ℹ️  Node 缓存目录不存在
)
goto end

:all_clean
echo.
echo [1/6] 清理 Chrome Cookie...
set "COOKIES_DIR=%CD%\cookies"
if exist "%COOKIES_DIR%" (
    rmdir /s /q "%COOKIES_DIR%" 2>nul
    echo ✅ Chrome Cookie 清理完成
)

echo [2/6] 清理 Token 使用日志...
if exist "ai_models.db" (
    sqlite3 ai_models.db "DELETE FROM token_logs;" 2>nul
    echo ✅ Token 使用日志清理完成
)

echo [3/6] 清理操作日志...
if exist "ai_models.db" (
    sqlite3 ai_models.db "DELETE FROM operation_logs;" 2>nul
    echo ✅ 操作日志清理完成
)

echo [4/6] 数据库优化...
if exist "ai_models.db" (
    sqlite3 ai_models.db "VACUUM;" 2>nul
    echo ✅ 数据库优化完成
)

echo [5/6] 清理 Node 缓存...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache" 2>nul
    echo ✅ Node 缓存清理完成
)

echo [6/6] 清理临时文件...
if exist "*.log" (
    del /q "*.log" 2>nul
    echo ✅ 临时日志文件清理完成
)
goto end

:cancel
echo.
echo 操作已取消
goto end

:end
echo.
echo ============================================
echo              清理完成！
echo ============================================
echo.
pause
