#!/bin/bash

echo "=========================================="
echo "  Установка Checklist на сервер"
echo "=========================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Ошибка: Запустите скрипт от root${NC}"
    exit 1
fi

echo -e "${YELLOW}Шаг 1: Обновление системы...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}Шаг 2: Установка необходимых пакетов...${NC}"
apt-get install -y curl wget git build-essential

echo -e "${YELLOW}Шаг 3: Установка Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Проверка установки Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Ошибка: Node.js не установлен${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js установлен: $(node --version)${NC}"
echo -e "${GREEN}✓ npm установлен: $(npm --version)${NC}"

echo -e "${YELLOW}Шаг 4: Установка PM2...${NC}"
npm install -g pm2

echo -e "${YELLOW}Шаг 5: Создание директории для проекта...${NC}"
mkdir -p /var/www
cd /var/www

# Проверка, существует ли уже проект
if [ -d "checklist" ]; then
    echo -e "${YELLOW}Директория checklist уже существует. Обновление...${NC}"
    cd checklist
    git pull || echo "Не удалось обновить через git"
else
    echo -e "${YELLOW}Клонирование проекта из GitHub...${NC}"
    git clone https://github.com/testpagetesty/checklist.git
    cd checklist
fi

echo -e "${YELLOW}Шаг 6: Установка зависимостей проекта...${NC}"
npm install

echo -e "${YELLOW}Шаг 7: Настройка порта в server.js...${NC}"
# Убеждаемся что порт 3000 используется
sed -i 's/const PORT = process.env.PORT || 3000;/const PORT = process.env.PORT || 3000;/' server.js

echo -e "${YELLOW}Шаг 8: Запуск приложения через PM2...${NC}"
pm2 delete checklist 2>/dev/null || true
pm2 start server.js --name checklist
pm2 save

echo -e "${YELLOW}Шаг 9: Настройка автозапуска PM2...${NC}"
pm2 startup | tail -1 | bash || echo "Автозапуск уже настроен"

echo -e "${YELLOW}Шаг 10: Настройка файрвола...${NC}"
# Проверка наличия ufw
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp
    echo -e "${GREEN}✓ Порт 3000 открыт в файрволе${NC}"
else
    echo -e "${YELLOW}⚠ ufw не найден, проверьте файрвол вручную${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
echo "  Установка завершена!"
echo "==========================================${NC}"
echo ""
echo "Приложение запущено и доступно по адресу:"
echo -e "${GREEN}http://45.15.126.22:3000${NC}"
echo ""
echo "Управление приложением:"
echo "  pm2 status          - статус"
echo "  pm2 logs checklist  - логи"
echo "  pm2 restart checklist - перезапуск"
echo ""
echo "Следующий шаг: Настройте Nginx для работы через домен whitepage.com"
echo "Запустите: bash setup_nginx.sh"

