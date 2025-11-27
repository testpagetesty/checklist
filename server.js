const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const app = express();
const PORT = process.env.PORT || 3000;

// Проверка, работает ли код на сервере (Vercel, Heroku и т.д.)
const isServerEnvironment = process.env.VERCEL || process.env.NOW_REGION || process.env.HEROKU_APP_NAME;

// Функция для проверки, является ли путь абсолютным Windows-путём
function isWindowsAbsolutePath(p) {
    return /^[A-Za-z]:[\\/]/.test(p);
}

// Функция для безопасной обработки пути на сервере
function safeResolvePath(inputPath, fallbackDir = __dirname) {
    // Если путь не указан, используем fallback
    if (!inputPath || inputPath.trim() === '') {
        return fallbackDir;
    }
    
    // Если мы на сервере и путь абсолютный Windows-путь, используем только имя папки
    if (isServerEnvironment && isWindowsAbsolutePath(inputPath)) {
        // Извлекаем только имя папки из пути (например, '25' из 'C:\Users\...\25')
        const folderName = path.basename(inputPath);
        return path.join(fallbackDir, folderName);
    }
    
    // Для локального окружения или относительных путей - нормализуем как обычно
    return path.normalize(path.resolve(inputPath));
}

app.use(express.json());

// Статические файлы из корня
app.use(express.static(__dirname));

// Хранилище для базового пути (для одного пользователя достаточно простого объекта)
let currentBasePath = __dirname;

// Хранилище для последнего отчета в памяти (для работы на read-only файловой системе)
let lastReportHtml = null;

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
        
        // Безопасно обрабатываем путь (на сервере Windows-пути не работают)
        const targetPath = safeResolvePath(folderPath, __dirname);
        
        // Сохраняем базовый путь для использования в других маршрутах
        currentBasePath = targetPath;
        
        // Используем Node.js скрипт вместо PowerShell
        const { checkSites, generateReport } = require('./check_sites_node.js');
        
        // Выполняем проверку
        const results = await checkSites(targetPath);
        
        // Генерируем отчет - на Vercel используем skipFileWrite
        const reportPath = path.join(targetPath, 'structure_report.html');
        const stats = await generateReport(results, reportPath, targetPath, isServerEnvironment);
        
        // Используем HTML напрямую из функции, если доступен, иначе пытаемся прочитать файл
        let report = stats.html || '';
        
        if (!report && !isServerEnvironment) {
            // Локально пытаемся прочитать файл, если HTML не вернулся
            try {
                const actualPath = stats.reportPath || reportPath;
                report = await fs.readFile(actualPath, 'utf8');
            } catch (e) {
                console.error('Error reading report:', e);
                report = '<p>Отчет еще не создан. Ошибка: ' + e.message + '</p>';
            }
        }
        
        // Сохраняем отчет в памяти для последующего доступа через /api/report
        lastReportHtml = report;
        
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
        // Сначала пробуем использовать отчет из памяти (для read-only файловой системы)
        if (lastReportHtml) {
            return res.send(lastReportHtml);
        }
        
        // Если нет в памяти, пробуем прочитать файл (для локального использования)
        const basePathInput = req.query.basePath ? decodeURIComponent(req.query.basePath) : currentBasePath;
        const basePath = safeResolvePath(basePathInput, currentBasePath);
        const reportPath = path.join(basePath, 'structure_report.html');
        
        // Проверяем существование файла перед чтением
        try {
            await fs.access(reportPath);
            const report = await fs.readFile(reportPath, 'utf8');
            return res.send(report);
        } catch (accessError) {
            // Если файл не найден, проверяем /tmp (может быть сохранен там на сервере)
            if (process.platform !== 'win32') {
                try {
                    const tmpPath = path.join('/tmp', 'structure_report.html');
                    await fs.access(tmpPath);
                    const report = await fs.readFile(tmpPath, 'utf8');
                    return res.send(report);
                } catch (tmpError) {
                    // Игнорируем ошибку /tmp
                }
            }
            return res.status(404).send('<p>Отчет не найден. Запустите анализ сначала.</p>');
        }
    } catch (error) {
        console.error('Error reading report:', error);
        res.status(404).send('<p>Отчет не найден. Ошибка: ' + error.message + '</p>');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    if (!isServerEnvironment) {
        console.log(`📁 Откройте браузер и перейдите по адресу: http://localhost:${PORT}`);
    } else {
        console.log(`📁 Сервер работает в продакшн режиме`);
    }
    console.log(`💡 ОС: ${process.platform}, Рабочая директория: ${process.cwd()}`);
});

