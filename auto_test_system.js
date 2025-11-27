const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Список всех сайтов
const sites = [
    'Akıl Oyunları',
    'AkılKulesi',
    'FunnyGames',
    'IQ Oyunları',
    'Kraken Games',
    'Logic Games',
    'Logic Games2',
    'Logic Games3',
    'Logika',
    'logika2',
    'logika3',
    'Mantik Oyunlari',
    'Mantik Oyunlari 2',
    'MantikOyun',
    'Mantık Oyunları',
    'MindGames',
    'Oyunlari',
    'Sea Games',
    'Zeka Dünyası',
    'Zeka Oyunları',
    'Zeka Platformu',
    'ZekaDünyası',
    'ZekaDünyası2',
    'ZekaDünyass',
    'ZekaOyunları'
];

const basePath = __dirname;

// Определение чек-листа с функциями проверки
const checklist = [
    {
        id: 'mobile-responsive',
        name: 'Адаптивность главной страницы',
        category: 'Мобильная версия',
        check: async (page, sitePath) => {
            try {
                await page.setViewport({ width: 375, height: 667 });
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'networkidle0', timeout: 10000 });
                const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
                return bodyWidth <= 400; // Проверка на отсутствие горизонтального скролла
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'favicon-exists',
        name: 'Наличие favicon',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const favicon = await page.evaluate(() => {
                    const link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                    return link ? link.href : null;
                });
                return favicon !== null;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'contacts-map',
        name: 'Карта на странице контактов',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const contactPages = ['iletisim.html', 'contact.html', 'contacts.html'];
                for (const contactPage of contactPages) {
                    try {
                        await page.goto(`file://${sitePath}/${contactPage}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                        const hasMap = await page.evaluate(() => {
                            return document.querySelector('iframe[src*="google"], iframe[src*="maps"], .map, #map') !== null;
                        });
                        if (hasMap) return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'contact-address',
        name: 'Адрес на странице контактов',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const contactPages = ['iletisim.html', 'contact.html', 'contacts.html'];
                for (const contactPage of contactPages) {
                    try {
                        await page.goto(`file://${sitePath}/${contactPage}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                        const hasAddress = await page.evaluate(() => {
                            const text = document.body.innerText.toLowerCase();
                            return text.includes('адрес') || text.includes('address') || 
                                   document.querySelector('[class*="address"], [id*="address"]') !== null;
                        });
                        if (hasAddress) return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'contact-phone',
        name: 'Телефон на странице контактов',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const contactPages = ['iletisim.html', 'contact.html', 'contacts.html'];
                for (const contactPage of contactPages) {
                    try {
                        await page.goto(`file://${sitePath}/${contactPage}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                        const hasPhone = await page.evaluate(() => {
                            const text = document.body.innerText;
                            const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}/;
                            return phoneRegex.test(text) || 
                                   document.querySelector('a[href^="tel:"], [class*="phone"], [id*="phone"]') !== null;
                        });
                        if (hasPhone) return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'contact-email',
        name: 'Email на странице контактов',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const contactPages = ['iletisim.html', 'contact.html', 'contacts.html'];
                for (const contactPage of contactPages) {
                    try {
                        await page.goto(`file://${sitePath}/${contactPage}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                        const hasEmail = await page.evaluate(() => {
                            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
                            return emailRegex.test(document.body.innerText) ||
                                   document.querySelector('a[href^="mailto:"], [class*="email"], [id*="email"]') !== null;
                        });
                        if (hasEmail) return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'contact-form',
        name: 'Контактная форма',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const contactPages = ['iletisim.html', 'contact.html', 'contacts.html'];
                for (const contactPage of contactPages) {
                    try {
                        await page.goto(`file://${sitePath}/${contactPage}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                        const hasForm = await page.evaluate(() => {
                            return document.querySelector('form') !== null;
                        });
                        if (hasForm) return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'documents-display',
        name: 'Наличие документов (Privacy Policy, Terms)',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                const docFiles = [
                    'privacy-policy.html', 'gizlilik-politikasi.html', 'cerez-politikasi.html',
                    'cookie-politikasi.html', 'terms.html', 'kullanim-kosullari.html',
                    'kullanim-sartlari.html', 'feragatname.html'
                ];
                let foundDocs = 0;
                for (const docFile of docFiles) {
                    try {
                        await page.goto(`file://${sitePath}/${docFile}`, { waitUntil: 'domcontentloaded', timeout: 3000 });
                        foundDocs++;
                    } catch (e) {
                        continue;
                    }
                }
                return foundDocs >= 2; // Минимум 2 документа
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'hero-section',
        name: 'Наличие Hero раздела',
        category: 'Контент и структура',
        check: async (page, sitePath) => {
            try {
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const hasHero = await page.evaluate(() => {
                    return document.querySelector('[class*="hero"], [id*="hero"], section:first-of-type') !== null;
                });
                return hasHero;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'images-count',
        name: 'Наличие изображений (минимум 5)',
        category: 'Контент и структура',
        check: async (page, sitePath) => {
            try {
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const imageCount = await page.evaluate(() => {
                    return document.querySelectorAll('img').length;
                });
                return imageCount >= 5;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'menu-structure',
        name: 'Наличие меню навигации',
        category: 'Мобильная версия',
        check: async (page, sitePath) => {
            try {
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const hasMenu = await page.evaluate(() => {
                    return document.querySelector('nav, [class*="menu"], [class*="nav"], header nav') !== null;
                });
                return hasMenu;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'mobile-menu',
        name: 'Мобильное меню (бургер)',
        category: 'Мобильная версия',
        check: async (page, sitePath) => {
            try {
                await page.setViewport({ width: 375, height: 667 });
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const hasMobileMenu = await page.evaluate(() => {
                    return document.querySelector('[class*="burger"], [class*="hamburger"], [class*="mobile-menu"], button[aria-label*="menu"]') !== null;
                });
                return hasMobileMenu;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'footer-content',
        name: 'Наличие футера',
        category: 'Технические детали',
        check: async (page, sitePath) => {
            try {
                await page.goto(`file://${sitePath}/light.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                const hasFooter = await page.evaluate(() => {
                    return document.querySelector('footer, [class*="footer"]') !== null;
                });
                return hasFooter;
            } catch (e) {
                return false;
            }
        }
    },
    {
        id: 'thank-you-page',
        name: 'Страница "Спасибо"',
        category: 'Формы и навигация',
        check: async (page, sitePath) => {
            try {
                const thankYouPages = ['tesekkurler.html', 'thank-you.html', 'thanks.html'];
                for (const thankPage of thankYouPages) {
                    try {
                        await page.goto(`file://${sitePath}/${thankPage}`, { waitUntil: 'domcontentloaded', timeout: 3000 });
                        return true;
                    } catch (e) {
                        continue;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    }
];

// Основная функция тестирования
async function testAllSites() {
    console.log('🚀 Запуск автоматического тестирования сайтов...\n');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const results = [];
    
    for (const site of sites) {
        console.log(`📋 Тестирование: ${site}`);
        const sitePath = path.join(basePath, site);
        
        // Проверяем существование папки
        try {
            await fs.access(sitePath);
        } catch (e) {
            console.log(`   ⚠️  Папка не найдена, пропускаем\n`);
            results.push({
                site,
                status: 'not_found',
                checks: {}
            });
            continue;
        }
        
        const page = await browser.newPage();
        const siteResults = {
            site,
            status: 'tested',
            checks: {}
        };
        
        // Выполняем все проверки
        for (const checkItem of checklist) {
            try {
                const result = await checkItem.check(page, sitePath);
                siteResults.checks[checkItem.id] = {
                    name: checkItem.name,
                    category: checkItem.category,
                    passed: result
                };
                console.log(`   ${result ? '✅' : '❌'} ${checkItem.name}`);
            } catch (error) {
                siteResults.checks[checkItem.id] = {
                    name: checkItem.name,
                    category: checkItem.category,
                    passed: false,
                    error: error.message
                };
                console.log(`   ❌ ${checkItem.name} (ошибка: ${error.message})`);
            }
        }
        
        await page.close();
        results.push(siteResults);
        console.log('');
    }
    
    await browser.close();
    
    // Генерируем отчет
    await generateReport(results);
    
    console.log('✅ Тестирование завершено! Отчет сохранен в report.html');
}

// Генерация HTML отчета
async function generateReport(results) {
    const categories = [...new Set(checklist.map(c => c.category))];
    
    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчет автоматического тестирования сайтов</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #d4af37; margin-bottom: 30px; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #1a1a1a;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }
        .stat-number { font-size: 2em; color: #d4af37; font-weight: bold; }
        .stat-label { color: #999; margin-top: 5px; }
        table {
            width: 100%;
            border-collapse: collapse;
            background: #1a1a1a;
            margin-bottom: 30px;
        }
        th {
            background: #2a2a2a;
            color: #d4af37;
            padding: 15px;
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #333;
        }
        tr:hover { background: #222; }
        .status-ok { color: #4caf50; font-weight: bold; }
        .status-fail { color: #f44336; font-weight: bold; }
        .status-na { color: #999; }
        .site-name { font-weight: bold; color: #e0e0e0; }
        .category-header {
            background: #2a2a2a;
            color: #d4af37;
            font-weight: bold;
            padding: 10px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Отчет автоматического тестирования сайтов</h1>
        <p style="color: #999; margin-bottom: 30px;">Дата: ${new Date().toLocaleString('ru-RU')}</p>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-number">${results.length}</div>
                <div class="stat-label">Всего сайтов</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${results.filter(r => r.status === 'tested').length}</div>
                <div class="stat-label">Протестировано</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${calculateAverageProgress(results)}%</div>
                <div class="stat-label">Средний прогресс</div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Сайт</th>`;
    
    // Добавляем заголовки для каждой проверки
    checklist.forEach(check => {
        html += `<th>${check.name}</th>`;
    });
    html += `<th>Прогресс</th></tr></thead><tbody>`;
    
    // Добавляем данные по каждому сайту
    results.forEach(result => {
        html += `<tr><td class="site-name">${result.site}</td>`;
        
        let passedCount = 0;
        let totalCount = 0;
        
        checklist.forEach(check => {
            const checkResult = result.checks[check.id];
            if (checkResult) {
                totalCount++;
                if (checkResult.passed) {
                    passedCount++;
                    html += `<td class="status-ok">✅</td>`;
                } else {
                    html += `<td class="status-fail">❌</td>`;
                }
            } else {
                html += `<td class="status-na">-</td>`;
            }
        });
        
        const progress = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
        html += `<td><strong>${progress}%</strong> (${passedCount}/${totalCount})</td></tr>`;
    });
    
    html += `</tbody></table>
    </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(basePath, 'report.html'), html, 'utf-8');
}

// Расчет среднего прогресса
function calculateAverageProgress(results) {
    const testedSites = results.filter(r => r.status === 'tested');
    if (testedSites.length === 0) return 0;
    
    let totalProgress = 0;
    testedSites.forEach(result => {
        let passed = 0;
        let total = 0;
        Object.values(result.checks).forEach(check => {
            total++;
            if (check.passed) passed++;
        });
        if (total > 0) {
            totalProgress += Math.round((passed / total) * 100);
        }
    });
    
    return Math.round(totalProgress / testedSites.length);
}

// Запуск тестирования
testAllSites().catch(console.error);

