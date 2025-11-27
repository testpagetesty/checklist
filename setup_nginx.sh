#!/bin/bash

echo "=========================================="
echo "  Настройка Nginx для Checklist"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Ошибка: Запустите скрипт от root${NC}"
    exit 1
fi

echo -e "${YELLOW}Шаг 1: Установка Nginx...${NC}"
apt-get install -y nginx

echo -e "${YELLOW}Шаг 2: Создание конфигурации Nginx...${NC}"

cat > /etc/nginx/sites-available/checklist << 'EOF'
server {
    listen 80;
    server_name whitepage.com www.whitepage.com 45.15.126.22;

    # Логи
    access_log /var/log/nginx/checklist_access.log;
    error_log /var/log/nginx/checklist_error.log;

    # Максимальный размер загружаемых файлов
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для долгих операций
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

echo -e "${YELLOW}Шаг 3: Активация конфигурации...${NC}"
ln -sf /etc/nginx/sites-available/checklist /etc/nginx/sites-enabled/

# Удаление дефолтной конфигурации если есть
rm -f /etc/nginx/sites-enabled/default

echo -e "${YELLOW}Шаг 4: Проверка конфигурации Nginx...${NC}"
nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Конфигурация Nginx корректна${NC}"
    echo -e "${YELLOW}Шаг 5: Перезапуск Nginx...${NC}"
    systemctl restart nginx
    systemctl enable nginx
    
    echo ""
    echo -e "${GREEN}=========================================="
    echo "  Nginx настроен!"
    echo "==========================================${NC}"
    echo ""
    echo "Приложение доступно по адресам:"
    echo -e "${GREEN}http://whitepage.com${NC}"
    echo -e "${GREEN}http://www.whitepage.com${NC}"
    echo -e "${GREEN}http://45.15.126.22${NC}"
    echo ""
    echo "Убедитесь что DNS записи настроены:"
    echo "  A запись: whitepage.com → 45.15.126.22"
    echo "  A запись: www.whitepage.com → 45.15.126.22"
else
    echo -e "${RED}Ошибка в конфигурации Nginx${NC}"
    exit 1
fi

