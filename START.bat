@echo off
echo ========================================
echo   Система анализа сайтов
echo ========================================
echo.
echo Проверка Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не установлен!
    echo Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js найден!
echo.
echo Проверка зависимостей...
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить зависимости
        pause
        exit /b 1
    )
)

echo.
echo Запуск сервера...
echo.
echo ========================================
echo   Сервер будет доступен по адресу:
echo   http://localhost:3000
echo ========================================
echo.
echo Нажмите Ctrl+C для остановки сервера
echo.

node server.js

pause

