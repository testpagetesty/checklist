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

// Хранилище для активных клиент-агентов (URL агента -> активен)
const activeAgents = new Map();

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

// API: Регистрация клиент-агента
app.post('/api/register-agent', (req, res) => {
    const { agentUrl } = req.body;
    if (agentUrl) {
        activeAgents.set(agentUrl, { url: agentUrl, lastSeen: Date.now() });
        console.log(`✅ Клиент-агент зарегистрирован: ${agentUrl}`);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'URL агента не указан' });
    }
});

// Функция для работы с файлами через агента
async function accessViaAgent(agentUrl, folderPath) {
    try {
        const response = await fetch(`${agentUrl}/api/access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath })
        });
        return await response.json();
    } catch (error) {
        throw new Error(`Не удалось подключиться к агенту: ${error.message}`);
    }
}

// API: Запустить проверку сайтов
app.post('/api/analyze', async (req, res) => {
    try {
        const { folderPath, agentUrl } = req.body;
        
        console.log('📁 Original folderPath:', folderPath);
        console.log('🌐 Is server environment:', isServerEnvironment);
        console.log('🔌 Agent URL:', agentUrl || 'не указан');
        console.log('📂 __dirname:', __dirname);
        console.log('💻 process.cwd():', process.cwd());
        
        // Если указан Windows-путь И есть агент - работаем через агента
        if (folderPath && isWindowsAbsolutePath(folderPath)) {
            if (agentUrl && activeAgents.has(agentUrl)) {
                console.log('✅ Используем клиент-агент для доступа к локальным файлам');
                // Проверяем доступность через агента
                try {
                    const agentResponse = await accessViaAgent(agentUrl, folderPath);
                    if (!agentResponse.accessible) {
                        return res.json({
                            success: false,
                            error: `Путь недоступен через агент: ${agentResponse.error}`,
                            output: '',
                            report: `<div style="padding: 20px; background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; margin: 20px;">
                                <h3>❌ Путь недоступен</h3>
                                <p><strong>Путь:</strong> ${folderPath}</p>
                                <p><strong>Ошибка:</strong> ${agentResponse.error}</p>
                                <p>Убедитесь, что клиент-агент запущен и путь указан правильно.</p>
                            </div>`,
                            stats: { total: 0, existing: 0, withMain: 0, withContact: 0, withFavicon: 0, withThankYou: 0, withImages5: 0, withMap: 0, withForm: 0 }
                        });
                    }
                    // Сохраняем информацию для использования в check_sites_node.js
                    currentBasePath = { type: 'agent', agentUrl, folderPath };
                    // Используем специальную версию checkSites для работы через агента
                    const { checkSitesViaAgent, generateReport } = require('./check_sites_node.js');
                    const results = await checkSitesViaAgent(agentUrl, folderPath);
                    // ... продолжаем как обычно
                    const reportPath = path.join(__dirname, 'structure_report.html');
                    const stats = await generateReport(results, reportPath, folderPath, true, agentUrl);
                    // ... остальной код генерации отчета
                } catch (agentError) {
                    return res.json({
                        success: false,
                        error: `Ошибка при работе с агентом: ${agentError.message}`,
                        output: '',
                        report: `<div style="padding: 20px; background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; margin: 20px;">
                            <h3>❌ Ошибка подключения к агенту</h3>
                            <p>${agentError.message}</p>
                            <p>Убедитесь, что клиент-агент запущен на вашем ПК.</p>
                        </div>`,
                        stats: { total: 0, existing: 0, withMain: 0, withContact: 0, withFavicon: 0, withThankYou: 0, withImages5: 0, withMap: 0, withForm: 0 }
                    });
                }
            } else {
                // Нет агента - просим его установить
                return res.json({
                    success: false,
                    error: 'Для проверки локальных файлов нужен клиент-агент',
                    output: '',
                    report: `<div style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; margin: 20px;">
                        <h3>⚠️ Нужен клиент-агент</h3>
                        <p>Для проверки локальных файлов с вашего ПК (${folderPath}) необходимо запустить клиент-агент.</p>
                        <p><strong>Инструкция:</strong></p>
                        <ol>
                            <li>Скачайте и установите клиент-агент (файлы client-agent.js и package.json)</li>
                            <li>Установите зависимости: <code>npm install</code></li>
                            <li>Запустите агент: <code>node client-agent.js</code></li>
                            <li>Скопируйте URL туннеля, который покажет агент</li>
                            <li>Укажите этот URL в поле "URL клиент-агента" на этой странице</li>
                        </ol>
                    </div>`,
                    stats: { total: 0, existing: 0, withMain: 0, withContact: 0, withFavicon: 0, withThankYou: 0, withImages5: 0, withMap: 0, withForm: 0 }
                });
            }
        }
        
        // Безопасно обрабатываем путь (на сервере Windows-пути не работают)
        const targetPath = safeResolvePath(folderPath, __dirname);
        console.log('✅ Resolved targetPath:', targetPath);
        
        // Проверяем доступность пути
        try {
            await fs.access(targetPath);
            console.log('✅ Path is accessible:', targetPath);
        } catch (accessError) {
            const errorMsg = `Путь недоступен: ${targetPath}. Ошибка: ${accessError.message}`;
            console.error('❌', errorMsg);
            
            return res.json({
                success: false,
                error: errorMsg,
                output: '',
                report: `<div style="padding: 20px; background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; margin: 20px;">
                    <h3>❌ Путь недоступен</h3>
                    <p><strong>Путь:</strong> ${targetPath}</p>
                    <p><strong>Ошибка:</strong> ${accessError.message}</p>
                    ${isServerEnvironment ? '<p><strong>Примечание:</strong> На сервере Vercel недоступны локальные пути с вашего компьютера. Используйте относительные пути от корня проекта.</p>' : '<p>Проверьте, что путь указан правильно и у приложения есть права доступа к этой директории.</p>'}
                </div>`,
                stats: {
                    total: 0,
                    existing: 0,
                    withMain: 0,
                    withContact: 0,
                    withFavicon: 0,
                    withThankYou: 0,
                    withImages5: 0,
                    withMap: 0,
                    withForm: 0
                }
            });
        }
        
        // Сохраняем базовый путь для использования в других маршрутах
        currentBasePath = targetPath;
        
        // Используем Node.js скрипт вместо PowerShell
        const { checkSites, generateReport } = require('./check_sites_node.js');
        
        // Выполняем проверку
        console.log('🔍 Starting checkSites for path:', targetPath);
        const results = await checkSites(targetPath);
        console.log('📊 Found results:', results.length);
        console.log('📋 Results sample:', results.slice(0, 3).map(r => ({ Site: r.Site, Exists: r.Exists })));
        
        if (!results || results.length === 0) {
            const message = `Не найдено сайтов в указанной папке: ${targetPath}`;
            console.warn('⚠️', message);
            
            return res.json({
                success: true,
                output: message + '\nПроверьте, что путь указан правильно и содержит папки с сайтами.',
                error: '',
                report: `<div style="padding: 20px; background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; margin: 20px;">
                    <h3>⚠️ Сайты не найдены</h3>
                    <p><strong>Путь:</strong> ${targetPath}</p>
                    <p>Не найдено папок с сайтами в указанной директории.</p>
                    ${isServerEnvironment ? '<p><strong>Примечание:</strong> На сервере доступны только файлы проекта. Для проверки локальных папок запустите сервер локально.</p>' : ''}
                </div>`,
                stats: {
                    total: 0,
                    existing: 0,
                    withMain: 0,
                    withContact: 0,
                    withFavicon: 0,
                    withThankYou: 0,
                    withImages5: 0,
                    withMap: 0,
                    withForm: 0
                }
            });
        }
        
        // Генерируем отчет - на Vercel используем skipFileWrite
        const reportPath = path.join(targetPath, 'structure_report.html');
        console.log('📝 Generating report...');
        const stats = await generateReport(results, reportPath, targetPath, isServerEnvironment);
        console.log('✅ Report generated. Has HTML:', !!stats.html, 'File written:', stats.fileWritten);
        
        // Используем HTML напрямую из функции, если доступен, иначе пытаемся прочитать файл
        let report = stats.html || '';
        
        if (!report) {
            console.log('⚠️ HTML not in stats, trying to read file...');
            if (!isServerEnvironment) {
                // Локально пытаемся прочитать файл, если HTML не вернулся
                try {
                    const actualPath = stats.reportPath || reportPath;
                    report = await fs.readFile(actualPath, 'utf8');
                    console.log('✅ Report read from file:', actualPath);
                } catch (e) {
                    console.error('❌ Error reading report:', e);
                    report = `<div style="padding: 20px; background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; margin: 20px;">
                        <h3>Ошибка создания отчета</h3>
                        <p>Отчет не был создан. Ошибка: ${e.message}</p>
                        <p><strong>Путь:</strong> ${stats.reportPath || reportPath}</p>
                    </div>`;
                }
            } else {
                report = `<div style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; margin: 20px;">
                    <h3>⚠️ Отчет не был сгенерирован</h3>
                    <p>Произошла ошибка при генерации отчета. Проверьте логи сервера.</p>
                </div>`;
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

