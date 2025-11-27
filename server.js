const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const PORT = 3000;

app.use(express.json());

// Статические файлы из корня
app.use(express.static(__dirname));

// Хранилище для базового пути (для одного пользователя достаточно простого объекта)
let currentBasePath = __dirname;

// Маршрут для раздачи файлов из папок сайтов (для просмотра в модальном окне)
app.get('/sites/:siteName/*', (req, res, next) => {
    const siteName = decodeURIComponent(req.params.siteName);
    const filePath = req.params[0] || 'index.html';
    
    // Используем сохраненный базовый путь или путь из query параметра
    const basePath = req.query.basePath ? decodeURIComponent(req.query.basePath) : currentBasePath;
    const fullPath = path.join(basePath, siteName, filePath);
    
    // Проверяем безопасность пути (защита от path traversal)
    const normalizedPath = path.normalize(fullPath);
    const baseDir = path.normalize(basePath);
    
    if (!normalizedPath.startsWith(baseDir)) {
        return res.status(403).send('Forbidden');
    }
    
    // Разрешаем загрузку в iframe
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    
    res.sendFile(normalizedPath, (err) => {
        if (err) {
            console.error('Error serving file:', err);
            res.status(404).send('File not found');
        }
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Получить список сайтов в текущей папке
app.get('/api/sites', async (req, res) => {
    try {
        const { checkSites } = require('./check_sites_node.js');
        const { findSiteFolders } = require('./check_sites_node.js');
        
        // Используем функцию поиска папок из модуля проверки
        const targetPath = req.query.path || __dirname;
        const sites = await findSiteFolders(targetPath);
        
        res.json({ 
            sites,
            count: sites.length,
            path: targetPath
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Запустить проверку сайтов
app.post('/api/analyze', async (req, res) => {
    try {
        const { folderPath } = req.body;
        const targetPath = folderPath || __dirname;
        
        // Сохраняем базовый путь для использования в других маршрутах
        // Нормализуем путь для правильной работы на Windows
        currentBasePath = path.normalize(path.resolve(targetPath));
        
        // Используем Node.js скрипт вместо PowerShell
        const { checkSites, generateReport } = require('./check_sites_node.js');
        
        // Выполняем проверку
        const results = await checkSites(targetPath);
        
        // Генерируем отчет
        // Нормализуем путь для правильной работы на Windows
        const normalizedTargetPath = path.normalize(path.resolve(targetPath));
        const reportPath = path.join(normalizedTargetPath, 'structure_report.html');
        const stats = await generateReport(results, reportPath, normalizedTargetPath);
        
        // Читаем отчет для отправки
        let report = '';
        try {
            const normalizedReportPath = path.normalize(reportPath);
            report = await fs.readFile(normalizedReportPath, 'utf8');
        } catch (e) {
            console.error('Error reading report:', e);
            report = '<p>Отчет еще не создан. Ошибка: ' + e.message + '</p>';
        }
        
        res.json({
            success: true,
            output: stats.output,
            error: '',
            report: report,
            stats: {
                total: stats.total,
                existing: stats.existing,
                withMain: stats.withMain,
                withContact: stats.withContact,
                withFavicon: stats.withFavicon,
                withThankYou: stats.withThankYou,
                withImages5: stats.withImages5,
                withMap: stats.withMap,
                withForm: stats.withForm
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            output: '',
            stderr: error.stack || ''
        });
    }
});

// API: Получить отчет
app.get('/api/report', async (req, res) => {
    try {
        // Используем сохраненный базовый путь или путь из query параметра
        const basePath = req.query.basePath ? decodeURIComponent(req.query.basePath) : currentBasePath;
        // Нормализуем путь для правильной работы на Windows
        const normalizedBasePath = path.normalize(path.resolve(basePath));
        const reportPath = path.join(normalizedBasePath, 'structure_report.html');
        const normalizedReportPath = path.normalize(reportPath);
        
        // Проверяем существование файла перед чтением
        try {
            await fs.access(normalizedReportPath);
        } catch (accessError) {
            return res.status(404).send('<p>Отчет не найден. Запустите анализ сначала.</p>');
        }
        
        const report = await fs.readFile(normalizedReportPath, 'utf8');
        res.send(report);
    } catch (error) {
        console.error('Error reading report:', error);
        res.status(404).send('<p>Отчет не найден. Ошибка: ' + error.message + '</p>');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Откройте браузер и перейдите по адресу выше`);
});

