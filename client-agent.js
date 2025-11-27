const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const localtunnel = require('localtunnel');

const CLIENT_PORT = 4000;
const SERVER_URL = process.env.SERVER_URL || 'http://45.15.126.22:3000';

const app = express();
app.use(express.json());

let tunnel = null;

// Разрешить CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// API: Получить список файлов/папок
app.post('/api/list', async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ error: 'Путь не указан' });
        }

        // Нормализация Windows пути
        const normalizedPath = path.normalize(folderPath);
        
        const stats = await fs.stat(normalizedPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Указанный путь не является папкой' });
        }

        const items = await fs.readdir(normalizedPath);
        const result = [];

        for (const item of items) {
            try {
                const itemPath = path.join(normalizedPath, item);
                const itemStats = await fs.stat(itemPath);
                result.push({
                    name: item,
                    path: itemPath,
                    isDirectory: itemStats.isDirectory(),
                    size: itemStats.size
                });
            } catch (e) {
                // Пропускаем недоступные файлы
            }
        }

        res.json({ items: result, path: normalizedPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Чтение файла
app.get('/api/file', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) {
            return res.status(400).json({ error: 'Путь не указан' });
        }

        const normalizedPath = path.normalize(filePath);
        const content = await fs.readFile(normalizedPath, 'utf8');
        res.send(content);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Проверка доступности пути
app.post('/api/access', async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ error: 'Путь не указан' });
        }

        const normalizedPath = path.normalize(folderPath);
        await fs.access(normalizedPath);
        
        const stats = await fs.stat(normalizedPath);
        res.json({ 
            accessible: true, 
            isDirectory: stats.isDirectory(),
            path: normalizedPath 
        });
    } catch (error) {
        res.json({ accessible: false, error: error.message });
    }
});

// API: Копирование файла/папки во временную директорию для анализа
app.post('/api/copy', async (req, res) => {
    try {
        const { sourcePath } = req.body;
        if (!sourcePath) {
            return res.status(400).json({ error: 'Путь не указан' });
        }

        const normalizedPath = path.normalize(sourcePath);
        const stats = await fs.stat(normalizedPath);
        
        if (stats.isDirectory()) {
            // Для папок - просто возвращаем путь, сервер будет обращаться напрямую
            res.json({ path: normalizedPath, type: 'directory' });
        } else {
            // Для файлов - читаем содержимое
            const content = await fs.readFile(normalizedPath);
            res.json({ content: content.toString('base64'), type: 'file' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const server = app.listen(CLIENT_PORT, async () => {
    console.log(`\n🔌 Клиент-агент запущен на порту ${CLIENT_PORT}`);
    console.log(`📁 Готов обрабатывать запросы к локальным файлам\n`);
    
    try {
        // Создаем туннель к серверу
        tunnel = await localtunnel({ port: CLIENT_PORT });
        
        console.log(`🌐 Туннель создан: ${tunnel.url}`);
        console.log(`\n✅ Агент готов к работе!`);
        console.log(`📋 Используйте этот URL в настройках сервера: ${tunnel.url}\n`);
        
        tunnel.on('close', () => {
            console.log('⚠️ Туннель закрыт');
        });
        
        // Регистрируемся на сервере
        try {
            const response = await fetch(`${SERVER_URL}/api/register-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentUrl: tunnel.url })
            });
            if (response.ok) {
                console.log('✅ Агент зарегистрирован на сервере\n');
            }
        } catch (e) {
            console.log('⚠️ Не удалось зарегистрироваться на сервере (это нормально, если сервер еще не обновлен)\n');
        }
        
    } catch (error) {
        console.error('❌ Ошибка создания туннеля:', error.message);
        console.log(`\n💡 Агент работает локально на http://localhost:${CLIENT_PORT}`);
        console.log(`💡 Настройте туннель вручную или обновите код\n`);
    }
});

process.on('SIGINT', () => {
    console.log('\n\n⏹️  Остановка агента...');
    if (tunnel) tunnel.close();
    server.close(() => {
        console.log('✅ Агент остановлен\n');
        process.exit(0);
    });
});

