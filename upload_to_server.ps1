# Скрипт для загрузки файлов на сервер через PowerShell

$serverIP = "45.15.126.22"
$username = "root"
$password = "42O4UZ8HWPBe"

Write-Host "Загрузка файлов на сервер..." -ForegroundColor Green

# Проверка наличия файлов
if (-not (Test-Path "deploy.sh")) {
    Write-Host "Ошибка: файл deploy.sh не найден!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "setup_nginx.sh")) {
    Write-Host "Ошибка: файл setup_nginx.sh не найден!" -ForegroundColor Red
    exit 1
}

Write-Host "`nВариант 1: Используйте WinSCP или FileZilla для загрузки файлов" -ForegroundColor Yellow
Write-Host "Вариант 2: Создайте файлы прямо на сервере (см. инструкцию ниже)`n" -ForegroundColor Yellow

Write-Host "Для подключения к серверу используйте:" -ForegroundColor Cyan
Write-Host "ssh root@45.15.126.22" -ForegroundColor White
Write-Host "Пароль: 42O4UZ8HWPBe`n" -ForegroundColor White

Write-Host "Или используйте PuTTY для подключения" -ForegroundColor Cyan

