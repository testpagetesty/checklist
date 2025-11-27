const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Функция для автоматического поиска всех папок с сайтами
async function findSiteFolders(basePath) {
    try {
        const entries = await fs.readdir(basePath, { withFileTypes: true });
        const folders = entries
            .filter(entry => entry.isDirectory())
            .filter(entry => {
                // Исключаем служебные папки
                const name = entry.name.toLowerCase();
                return !name.startsWith('.') && 
                       name !== 'node_modules' && 
                       name !== 'css' && 
                       name !== 'js' && 
                       name !== 'images' && 
                       name !== 'image' && 
                       name !== 'img';
            })
            .map(entry => entry.name);
        
        return folders.sort(); // Сортируем по алфавиту
    } catch (e) {
        console.error('Ошибка при чтении директории:', e.message);
        return [];
    }
}

// Вспомогательная функция для чтения HTML файла
async function readHtmlFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return cheerio.load(content);
    } catch (e) {
        return null;
    }
}

// Профессиональная проверка страницы контактов
async function checkContactPage(sitePath, specificPagePath = null) {
    // Если передан конкретный путь к странице, используем его
    if (specificPagePath) {
        try {
            const $ = await readHtmlFile(specificPagePath);
            if ($) {
                return await analyzeContactContent($, specificPagePath);
            }
        } catch (e) {
            // Продолжаем поиск
        }
    }
    
    // Сначала проверяем стандартные имена файлов
    const contactPages = ['iletisim.html', 'contact.html', 'contacts.html', 'contatti.html', 'اتصل.html', 'تواصل.html', 'contact-ar.html'];
    
    for (const page of contactPages) {
        const pagePath = path.join(sitePath, page);
        try {
            await fs.access(pagePath);
            const $ = await readHtmlFile(pagePath);
            if (!$) continue;
            
            return await analyzeContactContent($, pagePath);
        } catch (e) {
            continue;
        }
    }
    
    // АЛЬТЕРНАТИВНЫЙ ПОИСК: Сканируем все HTML файлы по содержимому
    try {
        const files = await fs.readdir(sitePath);
        const htmlFiles = files.filter(file => file.endsWith('.html') || file.endsWith('.htm'));
        
        // Исключаем документы и служебные страницы
        const excludedKeywords = ['privacy', 'cookie', 'terms', 'gizlilik', 'cerez', 'kullanim', 
                                   'disclaimer', 'legal', 'yasal', 'policy', 'politik',
                                   'thank', 'thanks', 'grazie', 'merci', 'spasibo', 'tesekkur'];
        
        for (const htmlFile of htmlFiles) {
            const fileNameLower = htmlFile.toLowerCase();
            // Пропускаем исключенные файлы
            if (excludedKeywords.some(keyword => fileNameLower.includes(keyword))) {
                continue;
            }
            
            try {
                const filePath = path.join(sitePath, htmlFile);
                const $ = await readHtmlFile(filePath);
                if (!$) continue;
                
                const htmlContent = $.html().toLowerCase();
                const bodyText = $('body').text().toLowerCase();
                
                // Признаки страницы контактов по содержимому:
                // 1. Наличие карты (Google Maps, Yandex Maps и т.д.)
                const hasMap = htmlContent.includes('google.com/maps') || 
                              htmlContent.includes('maps.google') ||
                              htmlContent.includes('yandex.ru/maps') ||
                              htmlContent.includes('openstreetmap') ||
                              $('iframe[src*="maps"], iframe[src*="map"]').length > 0 ||
                              $('[class*="map"], [id*="map"], [data-map]').length > 0;
                
                // 2. Наличие формы контактов
                const hasForm = $('form').length > 0 && (
                    $('form input[type="text"], form input[type="email"], form input[type="tel"]').length >= 2 ||
                    $('[class*="contact-form"], [id*="contact-form"], [class*="form"]').length > 0
                );
                
                // 3. Наличие контактной информации (адрес, телефон, email)
                const hasContactInfo = (
                    // Адрес
                    $('[class*="address"], [id*="address"], [class*="adres"], [class*="indirizzo"]').length > 0 ||
                    bodyText.match(/\d+[\s\-]?[a-zа-яё]+\s+\d+/) || // Паттерн адреса
                    // Телефон
                    $('a[href^="tel:"], [class*="phone"], [class*="tel"], [class*="telefon"], [class*="telefono"]').length > 0 ||
                    bodyText.match(/\+?\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/) || // Паттерн телефона
                    // Email
                    $('a[href^="mailto:"], [class*="email"], [class*="mail"], [class*="e-posta"]').length > 0 ||
                    bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) // Паттерн email
                );
                
                // 4. Классы и ID связанные с контактами (многоязычные)
                const contactSelectors = [
                    '[id*="contact"], [class*="contact"]',
                    '[id*="contatti"], [class*="contatti"]',
                    '[id*="iletisim"], [class*="iletisim"]',
                    '[id*="اتصل"], [class*="اتصل"]',
                    '[id*="تواصل"], [class*="تواصل"]',
                    'section#contact, section.contact',
                    '#contatti, .contatti'
                ];
                const hasContactSelector = contactSelectors.some(sel => {
                    try {
                        return $(sel).length > 0;
                    } catch (e) {
                        return false;
                    }
                });
                
                // 5. Ключевые слова в тексте (многоязычные)
                const contactKeywords = [
                    'contact', 'contacts', 'contatti', 'iletisim', 'اتصل', 'تواصل',
                    'address', 'adres', 'indirizzo', 'عنوان',
                    'phone', 'telefon', 'telefono', 'هاتف',
                    'email', 'e-mail', 'e-posta', 'posta elettronica', 'بريد إلكتروني'
                ];
                const hasContactKeywords = contactKeywords.some(keyword => 
                    bodyText.includes(keyword.toLowerCase()) || htmlContent.includes(keyword.toLowerCase())
                );
                
                // Если найдено минимум 2 признака страницы контактов, считаем это страницей контактов
                const contactScore = (hasMap ? 2 : 0) + 
                                    (hasForm ? 2 : 0) + 
                                    (hasContactInfo ? 1 : 0) + 
                                    (hasContactSelector ? 1 : 0) + 
                                    (hasContactKeywords ? 1 : 0);
                
                if (contactScore >= 2) {
                    // Это похоже на страницу контактов, анализируем её содержимое
                    return await analyzeContactContent($, filePath);
                }
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        // Игнорируем ошибку
    }
    
    // Если не нашли отдельную страницу контактов, проверяем главную страницу
    if (!specificPagePath) {
        try {
            const mainPages = ['index.html', 'index.htm', 'home.html', 'light.html'];
            for (const page of mainPages) {
                const pagePath = path.join(sitePath, page);
                try {
                    await fs.access(pagePath);
                    const $ = await readHtmlFile(pagePath);
                    if ($) {
                        // Проверяем наличие секции контактов
                        const hasContactSection = $('#contatti, [id*="contact"], [id*="contatti"], section#contatti, .contatti, .contact-section').length > 0;
                        if (hasContactSection) {
                            return await analyzeContactContent($, pagePath);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            // Игнорируем ошибку
        }
    }
    
    return { found: false, map: false, address: false, phone: false, email: false, form: false };
}

// Функция для анализа содержимого страницы контактов
async function analyzeContactContent($, pagePath) {
    const result = {
        found: true,
        map: false,
        address: false,
        phone: false,
        email: false,
        form: false
    };
    
    // Проверка карты - множественные селекторы и проверка содержимого
    const mapSelectors = [
        'iframe[src*="google"]',
        'iframe[src*="maps"]',
        'iframe[src*="yandex"]',
        'iframe[src*="openstreetmap"]',
        'iframe[src*="map"]',
        '#map', '.map', '[class*="map"]', '[id*="map"]',
        '[class*="google-map"]', '[id*="google-map"]',
        '[class*="yandex-map"]', '[class*="map-container"]',
        '[class*="contact-map"]', '[data-map]', '[data-google-map]'
    ];
    const hasMapSelector = mapSelectors.some(selector => $(selector).length > 0);
    
    // Также проверяем наличие iframe с картами в HTML коде
    const htmlContent = $.html().toLowerCase();
    const hasMapInHtml = htmlContent.includes('google.com/maps') || 
                         htmlContent.includes('maps.google') ||
                         htmlContent.includes('yandex.ru/maps') ||
                         htmlContent.includes('openstreetmap');
    
    result.map = hasMapSelector || hasMapInHtml;
    
    // Проверка адреса - по структуре DOM и тексту (многоязычно)
    const addressSelectors = [
        '[class*="address"]', '[id*="address"]', '[class*="adres"]',
        '[class*="indirizzo"]', '[id*="indirizzo"]',
        '[class*="contact"] [class*="address"]',
        '[class*="contact-info"]', '[class*="iletisim"]',
        '[class*="contatti"]', '[id*="contatti"]',
        'address', '[itemprop="address"]', '[itemprop="streetAddress"]',
        'h3:contains("Adres")', 'h3:contains("Address")', 'h3:contains("Адрес")',
        'h4:contains("Indirizzo")', 'h4:contains("Adres")'
    ];
    const addressKeywords = [
        'адрес', 'address', 'adres', 'adresse', 'адреса', 'adresi',
        'indirizzo', 'indirizzi', 'via', 'viale', 'corso', 'piazza',
        'улица', 'street', 'sokak', 'cadde', 'rue', 'strasse',
        'ул.', 'пр.', 'проспект', 'avenue', 'bulvar', 'boulevard',
        'istanbul', 'ankara', 'izmir', 'roma', 'milano', 'napoli',
        'türkiye', 'turkey', 'italia', 'italy'
    ];
    const hasAddressSelector = addressSelectors.some(sel => {
        try {
            return $(sel).length > 0;
        } catch (e) {
            return false;
        }
    });
    
    const bodyText = $('body').text().toLowerCase();
    const htmlContentLower = $.html().toLowerCase();
    const hasAddressText = addressKeywords.some(keyword => 
        bodyText.includes(keyword.toLowerCase()) || htmlContentLower.includes(keyword.toLowerCase())
    );
    
    // Проверяем наличие адресных паттернов (почтовые индексы, номера домов)
    const addressPatterns = [
        /\d{5}/,  // Почтовый индекс (5 цифр)
        /\d+[\s\-]?[a-zа-яё]+\s+\d+/,  // Номер дома и улица
        /[a-zа-яё]+\s+\d+[\s\-]?\d*/,  // Улица и номер
    ];
    const hasAddressPattern = addressPatterns.some(pattern => pattern.test(bodyText));
    
    result.address = hasAddressSelector || hasAddressText || hasAddressPattern;
    
    // Проверка телефона - по структуре DOM, паттернам и тексту
    const phoneSelectors = [
        'a[href^="tel:"]', '[class*="phone"]', '[id*="phone"]',
        '[class*="tel"]', '[id*="tel"]', '[class*="telefon"]',
        '[class*="telefono"]', '[id*="telefono"]',
        '[class*="contact-info"]', '[class*="contatti"]',
        '[itemprop="telephone"]', '[itemprop="phoneNumber"]',
        'h3:contains("Telefon")', 'h3:contains("Phone")', 'h3:contains("Телефон")',
        'h4:contains("Telefono")', 'h4:contains("Telefon")'
    ];
    const phoneKeywords = [
        'телефон', 'phone', 'tel', 'telefon', 'téléphone', 'телефона',
        'telefono', 'telefone', 'телефону', 'telephone', 'telefoni'
    ];
    const phonePatterns = [
        /\+?\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/,  // +1 (555) 178-4061
        /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/,  // +1 (555) 178-4061
        /\+\d{1,3}[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,6}/,  // +39 123 456 789 (итальянский формат)
        /\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/,  // 555 178 40 61
        /\(\d{3}\)[\s\-]?\d{3}[\s\-]?\d{4}/,  // (555) 178-4061
        /\+?\d{1,3}[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}/,  // +1 555 178 4061
        /\+\d{1,3}\s*\(\d{1,4}\)\s*\d{1,4}[\s\-]?\d{1,9}/  // +1 (555) 178-4061
    ];
    
    const hasPhoneSelector = phoneSelectors.some(sel => {
        try {
            return $(sel).length > 0;
        } catch (e) {
            return false;
        }
    });
    const hasPhoneText = phoneKeywords.some(keyword => 
        bodyText.includes(keyword.toLowerCase()) || htmlContentLower.includes(keyword.toLowerCase())
    );
    const hasPhonePattern = phonePatterns.some(pattern => pattern.test(bodyText) || pattern.test(htmlContentLower));
    
    // Дополнительно проверяем ссылки tel:
    const telLinks = $('a[href^="tel:"]').length;
    
    result.phone = hasPhoneSelector || hasPhoneText || hasPhonePattern || telLinks > 0;
    
    // Проверка email - по структуре DOM, паттернам и тексту
    const emailSelectors = [
        'a[href^="mailto:"]', '[class*="email"]', '[id*="email"]',
        '[class*="mail"]', '[id*="mail"]', '[class*="e-mail"]',
        '[class*="e-posta"]', '[class*="contact-info"]',
        '[class*="contatti"]', '[itemprop="email"]',
        'h3:contains("E-posta")', 'h3:contains("Email")',
        'h4:contains("Email")', 'h4:contains("E-posta")'
    ];
    const emailKeywords = [
        'email', 'e-mail', 'почта', 'mail', 'e-posta', 'courriel',
        'correo', 'eletrônico', 'электронная почта', 'eposta',
        'posta elettronica', 'indirizzo email'
    ];
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    
    const hasEmailSelector = emailSelectors.some(sel => {
        try {
            return $(sel).length > 0;
        } catch (e) {
            return false;
        }
    });
    const hasEmailText = emailKeywords.some(keyword => 
        bodyText.includes(keyword.toLowerCase()) || htmlContentLower.includes(keyword.toLowerCase())
    );
    const hasEmailPattern = emailPattern.test(bodyText) || emailPattern.test(htmlContentLower);
    const mailtoLinks = $('a[href^="mailto:"]').length;
    
    result.email = hasEmailSelector || hasEmailText || hasEmailPattern || mailtoLinks > 0;
    
    // Проверка формы - по структуре HTML и наличию полей
    const formSelectors = [
        'form',
        '[class*="form"]',
        '[id*="form"]',
        '[class*="contact-form"]',
        '[id*="contact-form"]',
        '[class*="contact-form-wrapper"]',
        '[id*="contactForm"]',
        '[id*="contactform"]'
    ];
    const hasFormElement = formSelectors.some(sel => {
        try {
            return $(sel).length > 0;
        } catch (e) {
            return false;
        }
    });
    
    // Также проверяем наличие формы в HTML коде
    const hasFormInHtml = htmlContentLower.includes('<form') || htmlContentLower.includes('contact-form');
    
    if (hasFormElement || hasFormInHtml) {
        // Проверяем наличие полей формы (более гибкая проверка)
        const formFields = $('form input[type="text"], form input[type="email"], form input[type="tel"], form textarea, form select, form input:not([type="submit"]):not([type="button"]):not([type="hidden"])').length;
        const submitButton = $('form button[type="submit"], form input[type="submit"], form button[type="button"]').length;
        
        // Также проверяем наличие полей по классам и ID
        const hasFormFields = $('[class*="form-input"], [class*="form-field"], [id*="name"], [id*="email"], [id*="message"]').length;
        
        result.form = (formFields >= 2 || hasFormFields >= 2) && (submitButton > 0 || hasFormInHtml);
    }
    
    return result;
}

// Функция для парсинга меню и получения списка страниц из навигации
async function parseNavigationPages(sitePath, mainPagePath) {
    const pages = new Set();
    
    if (!mainPagePath) return Array.from(pages);
    
    try {
        const $ = await readHtmlFile(mainPagePath);
        if (!$) return Array.from(pages);
        
        // Ищем ссылки в меню навигации
        const navSelectors = [
            'nav a[href$=".html"]',
            'header nav a[href$=".html"]',
            '.nav-menu a[href$=".html"]',
            '.nav-links a[href$=".html"]',
            '.navbar a[href$=".html"]',
            '.menu a[href$=".html"]',
            'ul.nav a[href$=".html"]',
            '.mobile-menu a[href$=".html"]',
            '.mobile-menu-links a[href$=".html"]'
        ];
        
        for (const selector of navSelectors) {
            try {
                $(selector).each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.endsWith('.html')) {
                        // Извлекаем имя файла
                        const fileName = href.split('/').pop().split('#')[0];
                        if (fileName) {
                            pages.add(fileName);
                        }
                    }
                });
            } catch (e) {
                continue;
            }
        }
        
        // Также проверяем футер на наличие ссылок
        try {
            $('footer a[href$=".html"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.endsWith('.html')) {
                    const fileName = href.split('/').pop().split('#')[0];
                    if (fileName) {
                        pages.add(fileName);
                    }
                }
            });
        } catch (e) {
            // Игнорируем ошибку
        }
        
    } catch (e) {
        // Игнорируем ошибку
    }
    
    return Array.from(pages);
}

// Функция для подсчета элементов наполнения данных на странице (между header и footer)
async function countDataElements(pagePath) {
    try {
        const $ = await readHtmlFile(pagePath);
        if (!$) return { total: 0, breakdown: {} };
        
        // Находим область между header и footer
        const header = $('header').first();
        const footer = $('footer').first();
        
        let mainContent;
        if (header.length && footer.length) {
            // Берем все элементы между header и footer
            mainContent = header.nextUntil('footer');
            // Также включаем main, если есть
            const main = $('main');
            if (main.length) {
                mainContent = main;
            }
        } else if ($('main').length) {
            mainContent = $('main');
        } else {
            // Если нет header/footer, берем body, но исключаем header и footer если они есть
            mainContent = $('body').children().not('header').not('footer');
        }
        
        // Если ничего не найдено, используем body
        if (!mainContent || mainContent.length === 0) {
            mainContent = $('body').children().not('header').not('footer');
        }
        
        const breakdown = {
            cards: 0,
            accordions: 0,
            faq: 0,
            tables: 0,
            lists: 0,
            articles: 0,
            testimonials: 0,
            statistics: 0,
            sections: 0
        };
        
        // Карточки (cards) - между header и footer
        const cardSelectors = [
            '.card', '[class*="card"]', '[class*="Card"]',
            '.game-card', '.article-card', '.testimonial-card',
            '.servizio-card', '.vantaggio-card', '.statistica-card',
            '.feature-card', '.product-card', '.service-card'
        ];
        for (const selector of cardSelectors) {
            try {
                const cards = mainContent.find(selector).length;
                if (cards > 0) {
                    breakdown.cards += cards;
                    break; // Чтобы не считать дважды
                }
            } catch (e) {
                continue;
            }
        }
        
        // Аккордеоны (accordions) - считаем количество элементов аккордеона
        const accordionSelectors = [
            '.accordion-item', '.accordion-content',
            '[class*="accordion-item"]', '[class*="accordion-content"]'
        ];
        for (const selector of accordionSelectors) {
            try {
                const items = mainContent.find(selector).length;
                if (items > 0) {
                    breakdown.accordions = items;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // Если аккордеоны не найдены, проверяем по родительскому элементу
        if (breakdown.accordions === 0) {
            mainContent.find('.accordion, [class*="accordion"]').each((i, el) => {
                const items = $(el).find('.accordion-item, [class*="accordion-item"]').length;
                if (items > 0) {
                    breakdown.accordions += items;
                }
            });
        }
        
        // FAQ секции
        const faqSelectors = [
            '#faq', '.faq', '[class*="faq"]',
            '[id*="faq"]', '.faq-item', '.faq-question'
        ];
        for (const selector of faqSelectors) {
            try {
                const items = mainContent.find(selector).length;
                if (items > 0) {
                    breakdown.faq = items;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // Таблицы с данными (не пустые)
        mainContent.find('table').each((i, el) => {
            const rows = $(el).find('tbody tr, tr').not('thead tr').length;
            if (rows > 0) {
                breakdown.tables += 1; // Считаем таблицу как один элемент
            }
        });
        
        // Списки с данными (ul/ol с несколькими элементами)
        mainContent.find('ul, ol').each((i, el) => {
            const items = $(el).find('li').length;
            if (items >= 3) { // Минимум 3 элемента для учета
                breakdown.lists += 1;
            }
        });
        
        // Статьи (articles)
        const articleSelectors = [
            'article', '.article', '[class*="article"]',
            '.post', '[class*="post"]', '.blog-post'
        ];
        for (const selector of articleSelectors) {
            try {
                const items = mainContent.find(selector).length;
                if (items > 0) {
                    breakdown.articles += items;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // Отзывы (testimonials/reviews)
        const testimonialSelectors = [
            '.testimonial', '[class*="testimonial"]',
            '.review', '[class*="review"]',
            '.testimonianza', '[class*="testimonianza"]'
        ];
        for (const selector of testimonialSelectors) {
            try {
                breakdown.testimonials += mainContent.find(selector).length;
            } catch (e) {
                continue;
            }
        }
        
        // Статистика (statistics)
        const statSelectors = [
            '.stat', '[class*="stat"]', '.statistic',
            '[class*="statistic"]', '.number', '[class*="counter"]'
        ];
        for (const selector of statSelectors) {
            try {
                const items = mainContent.find(selector).length;
                if (items > 0) {
                    breakdown.statistics += items;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // Секции с контентом (sections с достаточным содержимым)
        mainContent.find('section').each((i, el) => {
            const $section = $(el);
            const text = $section.text().trim();
            const hasContent = text.length > 200; // Минимум 200 символов текста
            const hasElements = $section.find('.card, .accordion, table, ul li, article').length > 0;
            if (hasContent || hasElements) {
                breakdown.sections += 1;
            }
        });
        
        // Общее количество элементов
        const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
        
        return { total, breakdown };
    } catch (e) {
        return { total: 0, breakdown: {} };
    }
}

async function checkSites(basePath) {
    const results = [];
    
    console.log('Поиск папок с сайтами...');
    
    // Автоматически находим все папки
    const sites = await findSiteFolders(basePath);
    console.log(`Найдено папок: ${sites.length}`);
    console.log('Проверка сайтов...\n');
    
    for (const site of sites) {
        const sitePath = path.join(basePath, site);
        const result = {
            Site: site,
            SitePath: sitePath, // Путь к папке сайта для просмотра
            MainPagePath: null, // Путь к главной странице
            FaviconPath: null, // Полный путь к favicon
            FaviconRelativePath: null, // Относительный путь к favicon от главной страницы
            Exists: false,
            MainPage: false,
            ContactPage: false,
            Documents: 0,
            Images: 0,
            ImagesMin5: false,
            MainPageImages: 0,
            MainPageImagesMin5: false,
            Favicon: false,
            ContactMap: false,
            ContactAddress: false,
            ContactPhone: false,
            ContactEmail: false,
            ContactForm: false,
            ThankYouPage: false,
            ThankYouPageType: null, // 'page', 'modal', или null
            PagesDataElements: {}, // Объект: { 'page.html': { total: число, breakdown: {...} } }
            FooterDocuments: false // Наличие ссылок на документы в футере
        };
        
        try {
            const stats = await fs.stat(sitePath);
            if (stats.isDirectory()) {
                result.Exists = true;
                
                // Проверка главной страницы - улучшенная идентификация по коду
                const mainPages = ['light.html', 'index.html', 'home.html', 'main.html', 'default.html'];
                let mainPagePath = null;
                
                // Сначала проверяем стандартные имена файлов
                for (const page of mainPages) {
                    try {
                        const pagePath = path.join(sitePath, page);
                        await fs.access(pagePath);
                        result.MainPage = true;
                        mainPagePath = pagePath;
                        result.MainPagePath = pagePath; // Сохраняем путь к главной странице
                        break;
                    } catch (e) {
                        // Продолжаем поиск
                        continue;
                    }
                }
                
                // Если не нашли, проверяем все HTML файлы на наличие index.html (регистронезависимо)
                if (!mainPagePath) {
                    try {
                        const files = await fs.readdir(sitePath);
                        const indexFile = files.find(file => 
                            file.toLowerCase() === 'index.html' && file.endsWith('.html')
                        );
                        if (indexFile) {
                            const pagePath = path.join(sitePath, indexFile);
                            await fs.access(pagePath);
                            result.MainPage = true;
                            mainPagePath = pagePath;
                            result.MainPagePath = pagePath; // Сохраняем путь к главной странице
                        }
                    } catch (e) {
                        // Продолжаем поиск по коду
                    }
                }
                
                // Если не нашли по имени, ищем по признакам главной страницы в коде
                if (!mainPagePath) {
                    try {
                        const files = await fs.readdir(sitePath);
                        const htmlFiles = files.filter(file => file.endsWith('.html'));
                        
                        // Признаки главной страницы:
                        // 1. Hero section (hero, banner, welcome)
                        // 2. Главная навигация с множеством ссылок
                        // 3. Секции: about, services, portfolio и т.д.
                        // 4. Отсутствие специфичных признаков других страниц
                        
                        let bestMatch = null;
                        let bestScore = 0;
                        
                        for (const htmlFile of htmlFiles) {
                            try {
                                const filePath = path.join(sitePath, htmlFile);
                                const html = await fs.readFile(filePath, 'utf8');
                                const $ = cheerio.load(html);
                                const htmlContent = html.toLowerCase();
                                
                                let score = 0;
                                
                                // Проверяем наличие hero section
                                const heroSelectors = [
                                    '.hero', '#hero', '[class*="hero"]', '[id*="hero"]',
                                    '.banner', '#banner', '[class*="banner"]',
                                    '.welcome', '#welcome', '[class*="welcome"]',
                                    'section.hero', 'section#hero', 'section[class*="hero"]'
                                ];
                                for (const selector of heroSelectors) {
                                    try {
                                        if ($(selector).length > 0) {
                                            score += 10;
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                // Также проверяем наличие hero в HTML коде напрямую
                                if (htmlContent.includes('class="hero') || 
                                    htmlContent.includes('class=\'hero') ||
                                    htmlContent.includes('id="hero') ||
                                    htmlContent.includes('id=\'hero')) {
                                    score += 10;
                                }
                                
                                // Проверяем главную навигацию с множеством ссылок
                                const navLinks = $('nav a, header a, .nav a, .navigation a').length;
                                if (navLinks >= 3) {
                                    score += 5;
                                }
                                
                                // Проверяем наличие типичных секций главной страницы
                                const mainPageSections = [
                                    'about', 'services', 'portfolio', 'contact',
                                    'hakkımızda', 'hizmetler', 'hizmet', 'iletisim',
                                    'chi siamo', 'servizi', 'contatti'
                                ];
                                for (const section of mainPageSections) {
                                    if (htmlContent.includes(`id="${section}"`) || 
                                        htmlContent.includes(`class="${section}"`) ||
                                        htmlContent.includes(`#${section}`) ||
                                        htmlContent.includes(`.${section}`)) {
                                        score += 3;
                                    }
                                }
                                
                                // Проверяем наличие множества секций
                                const sections = $('section').length;
                                if (sections >= 3) {
                                    score += 5;
                                }
                                
                                // Проверяем наличие множества изображений (главная обычно богата контентом)
                                const images = $('img').length;
                                if (images >= 3) {
                                    score += 3;
                                }
                                
                                // Штрафуем страницы, которые явно НЕ главные
                                const notMainIndicators = [
                                    'thank', 'spasibo', 'tesekkur', 'merci', 'grazie',
                                    'privacy', 'cookie', 'terms', 'gizlilik', 'cerez',
                                    'contact', 'contatti', 'iletisim'
                                ];
                                const fileNameLower = htmlFile.toLowerCase();
                                for (const indicator of notMainIndicators) {
                                    if (fileNameLower.includes(indicator)) {
                                        score -= 20; // Сильный штраф
                                        break;
                                    }
                                }
                                
                                // Проверяем, что это не документ (обычно длинные тексты без секций)
                                const textLength = $('body').text().length;
                                const hasLongText = textLength > 5000;
                                const hasFewSections = sections < 2;
                                if (hasLongText && hasFewSections) {
                                    score -= 10; // Похоже на документ
                                }
                                
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMatch = filePath;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        // Если нашли хорошее совпадение (score >= 8), используем его
                        // Снизили порог с 10 до 8, чтобы находить больше главных страниц
                        if (bestMatch && bestScore >= 8) {
                            mainPagePath = bestMatch;
                            result.MainPage = true;
                            result.MainPagePath = bestMatch; // Сохраняем путь к главной странице
                        } else if (bestMatch && bestScore > 0) {
                            // Если есть хотя бы какое-то совпадение, но score низкий,
                            // проверяем, не является ли это файл с именем, похожим на главную
                            const bestFileName = path.basename(bestMatch).toLowerCase();
                            if (bestFileName === 'index.html' || 
                                bestFileName === 'home.html' || 
                                bestFileName === 'main.html') {
                                mainPagePath = bestMatch;
                                result.MainPage = true;
                                result.MainPagePath = bestMatch; // Сохраняем путь к главной странице
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                
                // Проверка страницы контактов (базовая)
                const contactPagesBasic = ['iletisim.html', 'contact.html', 'contacts.html', 'contatti.html'];
                let contactPageFound = false;
                let contactPagePath = null;
                
                for (const page of contactPagesBasic) {
                    try {
                        const pagePath = path.join(sitePath, page);
                        await fs.access(pagePath);
                        result.ContactPage = true;
                        contactPageFound = true;
                        contactPagePath = pagePath;
                        break;
                    } catch (e) {
                        continue;
                    }
                }
                
                // Если отдельной страницы контактов нет, проверяем главную страницу на наличие секции контактов
                if (!contactPageFound && mainPagePath) {
                    try {
                        const $ = await readHtmlFile(mainPagePath);
                        if ($) {
                            // Проверяем наличие секции контактов на главной странице
                            const contactSection = $('#contatti, [id*="contact"], [id*="contatti"], section#contatti, .contatti, .contact-section').length;
                            const hasContactLink = $('a[href*="#contatti"], a[href*="#contact"], a[href*="contact"], a[href*="contatti"]').length;
                            
                            if (contactSection > 0 || hasContactLink > 0) {
                                result.ContactPage = true;
                                contactPagePath = mainPagePath; // Используем главную страницу для проверки контактов
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                
                // Подсчет документов
                try {
                    const files = await fs.readdir(sitePath);
                    const docFiles = files.filter(file => 
                        file.match(/privacy|gizlilik|cerez|cookie|terms|kullanim|feragat/i)
                    );
                    result.Documents = docFiles.length;
                } catch (e) {
                    result.Documents = 0;
                }
                
                // Проверка наличия ссылок на документы в футере
                let footerHasDocuments = false;
                if (mainPagePath) {
                    try {
                        const $ = await readHtmlFile(mainPagePath);
                        if ($) {
                            const footer = $('footer');
                            if (footer.length > 0) {
                                // Ключевые слова для документов
                                const docKeywords = [
                                    'privacy', 'gizlilik', 'cerez', 'cookie', 
                                    'terms', 'kullanim', 'feragat', 'disclaimer',
                                    'legal', 'yasal', 'policy', 'politik'
                                ];
                                
                                // Ищем ссылки в футере
                                const footerLinks = footer.find('a');
                                footerLinks.each((i, el) => {
                                    const href = $(el).attr('href') || '';
                                    const text = $(el).text().toLowerCase();
                                    
                                    // Проверяем href и текст ссылки
                                    const hasDocKeyword = docKeywords.some(keyword => 
                                        href.toLowerCase().includes(keyword) || 
                                        text.includes(keyword)
                                    );
                                    
                                    if (hasDocKeyword) {
                                        footerHasDocuments = true;
                                        return false; // Прерываем цикл
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                result.FooterDocuments = footerHasDocuments;
                
                // Подсчет изображений (из файлов и из HTML кода)
                const imageDirs = ['images', 'image', 'img'];
                let imageCount = 0;
                
                // Подсчет из файлов
                for (const imgDir of imageDirs) {
                    try {
                        const imgPath = path.join(sitePath, imgDir);
                        const stats = await fs.stat(imgPath);
                        if (stats.isDirectory()) {
                            const files = await fs.readdir(imgPath, { recursive: true });
                            const images = files.filter(file => 
                                /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file)
                            );
                            imageCount += images.length;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // Также считаем изображения из HTML кода главной страницы
                // НО только локальные файлы, которые реально существуют
                if (mainPagePath) {
                    const $ = await readHtmlFile(mainPagePath);
                    if ($) {
                        // Учитываем только уникальные локальные изображения (по src), которые существуют
                        const uniqueImages = new Set();
                        $('img').each((i, el) => {
                            const src = $(el).attr('src');
                            if (src && !src.startsWith('data:') && !src.startsWith('#') && 
                                !src.startsWith('http://') && !src.startsWith('https://')) {
                                // Проверяем, существует ли локальный файл
                                try {
                                    const imgPath = path.resolve(path.dirname(mainPagePath), src.split('?')[0].split('#')[0]);
                                    if (fsSync.existsSync(imgPath)) {
                                        const stats = fsSync.statSync(imgPath);
                                        if (stats.isFile()) {
                                            uniqueImages.add(src);
                                        }
                                    }
                                } catch (e) {
                                    // Файл не существует, не считаем
                                }
                            }
                        });
                        
                        // Также считаем background-image в стилях, но только локальные файлы
                        const htmlContent = $.html();
                        const bgImageMatches = htmlContent.match(/background[-\s]?image:\s*url\(['"]?([^'")]+)/gi) || [];
                        for (const match of bgImageMatches) {
                            const urlMatch = match.match(/url\(['"]?([^'")]+)/i);
                            if (urlMatch && urlMatch[1]) {
                                const bgUrl = urlMatch[1].trim();
                                if (!bgUrl.startsWith('data:') && !bgUrl.startsWith('http://') && 
                                    !bgUrl.startsWith('https://') && !bgUrl.toLowerCase().includes('favicon')) {
                                    try {
                                        const bgPath = path.resolve(path.dirname(mainPagePath), bgUrl.split('?')[0].split('#')[0]);
                                        if (fsSync.existsSync(bgPath)) {
                                            const stats = fsSync.statSync(bgPath);
                                            if (stats.isFile()) {
                                                uniqueImages.add(bgUrl);
                                            }
                                        }
                                    } catch (e) {
                                        // Файл не существует, не считаем
                                    }
                                }
                            }
                        }
                        
                        imageCount = Math.max(imageCount, uniqueImages.size);
                    }
                }
                
                result.Images = imageCount;
                result.ImagesMin5 = imageCount >= 5;
                
                // Отдельная проверка изображений на главной странице (должно быть ≥5)
                // Только локальные файлы, которые реально существуют
                let mainPageImageCount = 0;
                if (mainPagePath) {
                    const $ = await readHtmlFile(mainPagePath);
                    if ($) {
                        // Учитываем только уникальные локальные изображения (по src), которые существуют
                        const uniqueMainImages = new Set();
                        $('img').each((i, el) => {
                            const src = $(el).attr('src');
                            if (src && !src.startsWith('data:') && !src.startsWith('#') && 
                                !src.startsWith('http://') && !src.startsWith('https://') && !src.includes('favicon')) {
                                // Проверяем, существует ли локальный файл
                                try {
                                    const imgPath = path.resolve(path.dirname(mainPagePath), src.split('?')[0].split('#')[0]);
                                    if (fsSync.existsSync(imgPath)) {
                                        const stats = fsSync.statSync(imgPath);
                                        if (stats.isFile()) {
                                            uniqueMainImages.add(src);
                                        }
                                    }
                                } catch (e) {
                                    // Файл не существует, не считаем
                                }
                            }
                        });
                        
                        // Также считаем background-image в стилях, но только локальные файлы
                        const htmlContent = $.html();
                        const bgImageMatches = htmlContent.match(/background[-\s]?image:\s*url\(['"]?([^'")]+)/gi) || [];
                        for (const match of bgImageMatches) {
                            const urlMatch = match.match(/url\(['"]?([^'")]+)/i);
                            if (urlMatch && urlMatch[1]) {
                                const bgUrl = urlMatch[1].trim();
                                if (!bgUrl.startsWith('data:') && !bgUrl.startsWith('http://') && 
                                    !bgUrl.startsWith('https://') && !bgUrl.toLowerCase().includes('favicon')) {
                                    try {
                                        const bgPath = path.resolve(path.dirname(mainPagePath), bgUrl.split('?')[0].split('#')[0]);
                                        if (fsSync.existsSync(bgPath)) {
                                            const stats = fsSync.statSync(bgPath);
                                            if (stats.isFile()) {
                                                uniqueMainImages.add(bgUrl);
                                            }
                                        }
                                    } catch (e) {
                                        // Файл не существует, не считаем
                                    }
                                }
                            }
                        }
                        
                        mainPageImageCount = uniqueMainImages.size;
                    }
                }
                result.MainPageImages = mainPageImageCount;
                result.MainPageImagesMin5 = mainPageImageCount >= 5;
                
                // Проверка Favicon - ищем в HTML коде главной страницы через тег <link>
                // Favicon может называться как угодно, поэтому ищем по тегу, а не по имени файла
                let faviconFound = false;
                if (mainPagePath) {
                    try {
                        const $ = await readHtmlFile(mainPagePath);
                        if ($) {
                            // Ищем все возможные варианты favicon в HTML
                            const faviconSelectors = [
                                'link[rel="icon"]',
                                'link[rel="shortcut icon"]',
                                'link[rel="apple-touch-icon"]',
                                'link[rel="apple-touch-icon-precomposed"]',
                                'link[rel*="icon"]'
                            ];
                            
                            let faviconHref = null;
                            for (const selector of faviconSelectors) {
                                const link = $(selector).first();
                                if (link.length > 0) {
                                    faviconHref = link.attr('href');
                                    if (faviconHref) {
                                        break;
                                    }
                                }
                            }
                            
                            if (faviconHref) {
                                // Убираем параметры запроса и якоря
                                faviconHref = faviconHref.split('?')[0].split('#')[0];
                                
                                // Пропускаем внешние URL и data URI
                                if (!faviconHref.startsWith('http://') && 
                                    !faviconHref.startsWith('https://') && 
                                    !faviconHref.startsWith('data:')) {
                                    
                                    // Формируем полный путь к favicon относительно главной страницы
                                    const faviconFullPath = path.resolve(path.dirname(mainPagePath), faviconHref);
                                    
                                    // Проверяем, существует ли файл
                                    try {
                                        await fs.access(faviconFullPath);
                                        faviconFound = true;
                                        result.Favicon = true;
                                        // Сохраняем полный путь к favicon
                                        result.FaviconPath = faviconFullPath;
                                        // Также сохраняем относительный путь от главной страницы для правильного формирования URL
                                        result.FaviconRelativePath = faviconHref;
                                    } catch (e) {
                                        // Если файл не существует, все равно считаем что favicon найден
                                        // и сохраняем относительный путь для отображения
                                        faviconFound = true;
                                        result.Favicon = true;
                                        result.FaviconPath = faviconHref; // Сохраняем относительный путь
                                        result.FaviconRelativePath = faviconHref;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                
                // Если не нашли в HTML, проверяем стандартные имена файлов в корне (fallback)
                if (!faviconFound) {
                    const faviconPaths = [
                        path.join(sitePath, 'favicon.ico'),
                        path.join(sitePath, 'favicon.png'),
                        path.join(sitePath, 'favicon.jpg'),
                        path.join(sitePath, 'favicon.jpeg'),
                        path.join(sitePath, 'favicon.svg')
                    ];
                    
                    for (const faviconPath of faviconPaths) {
                        try {
                            await fs.access(faviconPath);
                            faviconFound = true;
                            result.Favicon = true;
                            result.FaviconPath = faviconPath;
                            // Для стандартных файлов относительный путь - это просто имя файла
                            result.FaviconRelativePath = path.basename(faviconPath);
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                // Профессиональная проверка страницы контактов
                const contactCheck = await checkContactPage(sitePath);
                if (contactCheck.found) {
                    result.ContactMap = contactCheck.map;
                    result.ContactAddress = contactCheck.address;
                    result.ContactPhone = contactCheck.phone;
                    result.ContactEmail = contactCheck.email;
                    result.ContactForm = contactCheck.form;
                }
                
                // Проверка страницы "Спасибо" (многоязычные варианты)
                const thankYouPages = [
                    // Турецкий
                    'tesekkurler.html', 'tesekkur.html', 'teşekkürler.html',
                    // Английский
                    'thank-you.html', 'thanks.html', 'thankyou.html', 'thank.html',
                    // Французский
                    'merci.html',
                    // Русский
                    'spasibo.html', 'spasiba.html', 'blagodarya.html',
                    // Итальянский
                    'grazie.html',
                    // Другие варианты
                    'success.html', 'success-page.html', 'thank-you-page.html'
                ];
                
                // Также проверяем содержимое HTML файлов на наличие текста благодарности
                let thankYouFound = false;
                let thankYouType = null; // 'page' или 'modal'
                
                // Сначала проверяем отдельные страницы
                for (const page of thankYouPages) {
                    try {
                        await fs.access(path.join(sitePath, page));
                        thankYouFound = true;
                        thankYouType = 'page';
                        break;
                    } catch (e) {
                        continue;
                    }
                }
                
                // Если не нашли отдельную страницу, проверяем модальные окна и содержимое HTML файлов
                if (!thankYouFound) {
                    try {
                        const files = await fs.readdir(sitePath);
                        const htmlFiles = files.filter(file => file.endsWith('.html') || file.endsWith('.htm'));
                        
                        const thankYouKeywords = [
                            // Русский
                            'спасибо', 'благодарим', 'благодарю',
                            // Английский
                            'thank you', 'thanks', 'thank',
                            // Турецкий
                            'teşekkürler', 'teşekkür', 'tesekkurler', 'tesekkur',
                            // Французский
                            'merci', 'merci beaucoup',
                            // Итальянский
                            'grazie', 'grazie mille',
                            // Немецкий
                            'danke', 'danke schön',
                            // Португальский
                            'obrigado', 'obrigada',
                            // Испанский
                            'gracias', 'muchas gracias',
                            // Арабский
                            'شكرا', 'شكر', 'شكراً',
                            // Другие
                            'success', 'successful', 'успешно'
                        ];
                        
                        for (const htmlFile of htmlFiles) {
                            try {
                                const filePath = path.join(sitePath, htmlFile);
                                const html = await fs.readFile(filePath, 'utf8');
                                const $ = cheerio.load(html);
                                const htmlContent = html.toLowerCase();
                                const bodyText = $('body').text().toLowerCase();
                                
                                // НОВАЯ ЛОГИКА: Ищем страницу "Спасибо" по JavaScript обработчикам форм
                                // Проверяем наличие обработчиков submit формы, которые делают редирект или показывают сообщение
                                const formSubmitPatterns = [
                                    /\.submit\s*\([^)]*\)/gi,
                                    /addEventListener\s*\(\s*['"]submit['"]/gi,
                                    /onsubmit\s*=/gi,
                                    /window\.location\s*=\s*['"]([^'"]+)['"]/gi,
                                    /window\.location\.href\s*=\s*['"]([^'"]+)['"]/gi,
                                    /location\.href\s*=\s*['"]([^'"]+)['"]/gi,
                                    /\.action\s*=\s*['"]([^'"]+)['"]/gi
                                ];
                                
                                // Ищем формы и их обработчики
                                const forms = $('form');
                                let hasFormRedirect = false;
                                let redirectTarget = null;
                                
                                for (let i = 0; i < forms.length; i++) {
                                    const form = forms.eq(i);
                                    const formAction = form.attr('action') || '';
                                    const formId = form.attr('id') || '';
                                    const formClass = form.attr('class') || '';
                                    
                                    // Проверяем action формы на наличие страницы спасибо
                                    if (formAction) {
                                        const actionLower = formAction.toLowerCase();
                                        const isThankYouPage = thankYouPages.some(page => 
                                            actionLower.includes(page.replace('.html', ''))
                                        ) || thankYouKeywords.some(keyword => actionLower.includes(keyword));
                                        
                                        if (isThankYouPage) {
                                            hasFormRedirect = true;
                                            redirectTarget = formAction;
                                            break;
                                        }
                                    }
                                    
                                    // Ищем JavaScript обработчики для этой формы
                                    const formScripts = html.match(new RegExp(`(${formId}|${formClass.replace(/\s+/g, '|')})[^}]*submit[^}]*`, 'gi')) || [];
                                    for (const script of formScripts) {
                                        // Проверяем редиректы в скриптах
                                        const redirectMatch = script.match(/(window\.location|location\.href)\s*=\s*['"]([^'"]+)['"]/i);
                                        if (redirectMatch && redirectMatch[2]) {
                                            const target = redirectMatch[2].toLowerCase();
                                            const isThankYouTarget = thankYouPages.some(page => 
                                                target.includes(page.replace('.html', ''))
                                            ) || thankYouKeywords.some(keyword => target.includes(keyword));
                                            
                                            if (isThankYouTarget) {
                                                hasFormRedirect = true;
                                                redirectTarget = redirectMatch[2];
                                                break;
                                            }
                                        }
                                    }
                                }
                                
                                // Проверяем все скрипты на наличие редиректов на страницу спасибо
                                const scripts = $('script');
                                for (let i = 0; i < scripts.length; i++) {
                                    const scriptContent = $(scripts[i]).html() || '';
                                    const scriptLower = scriptContent.toLowerCase();
                                    
                                    // Ищем редиректы
                                    const redirectMatches = scriptContent.match(/(window\.location|location\.href)\s*=\s*['"]([^'"]+)['"]/gi) || [];
                                    for (const match of redirectMatches) {
                                        const urlMatch = match.match(/['"]([^'"]+)['"]/);
                                        if (urlMatch && urlMatch[1]) {
                                            const targetUrl = urlMatch[1].toLowerCase();
                                            const isThankYouTarget = thankYouPages.some(page => 
                                                targetUrl.includes(page.replace('.html', ''))
                                            ) || thankYouKeywords.some(keyword => targetUrl.includes(keyword));
                                            
                                            if (isThankYouTarget) {
                                                hasFormRedirect = true;
                                                redirectTarget = urlMatch[1];
                                                break;
                                            }
                                        }
                                    }
                                    
                                    // Ищем показ модальных окон или сообщений после отправки формы
                                    if (scriptLower.includes('submit') && (
                                        scriptLower.includes('thank') || 
                                        scriptLower.includes('success') ||
                                        scriptLower.includes('спасибо') ||
                                        scriptLower.includes('teşekkür') ||
                                        scriptLower.includes('merci') ||
                                        scriptLower.includes('grazie')
                                    )) {
                                        hasFormRedirect = true;
                                        break;
                                    }
                                }
                                
                                // Проверяем наличие модальных окон со страницей "Спасибо"
                                const modalSelectors = [
                                    '[id*="thank"], [id*="success"], [id*="grazie"], [id*="merci"]',
                                    '[class*="thank"], [class*="success"], [class*="modal"]',
                                    '.modal', '#modal', '[class*="popup"]', '[id*="popup"]'
                                ];
                                
                                let hasModal = false;
                                for (const selector of modalSelectors) {
                                    try {
                                        const elements = $(selector);
                                        if (elements.length > 0) {
                                            const elementText = elements.text().toLowerCase();
                                            const hasThankYouInModal = thankYouKeywords.some(keyword => 
                                                elementText.includes(keyword.toLowerCase())
                                            );
                                            if (hasThankYouInModal) {
                                                hasModal = true;
                                                break;
                                            }
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                // Также проверяем наличие модальных окон в HTML коде
                                const hasModalInHtml = htmlContent.includes('class="modal') || 
                                                      htmlContent.includes('id="modal') ||
                                                      htmlContent.includes('class="popup') ||
                                                      htmlContent.includes('id="popup') ||
                                                      htmlContent.includes('data-modal') ||
                                                      htmlContent.includes('data-popup');
                                
                                // Проверяем наличие ключевых слов благодарности
                                const hasThankYouText = thankYouKeywords.some(keyword => 
                                    bodyText.includes(keyword.toLowerCase())
                                );
                                
                                // Также проверяем наличие кнопки "домой" или "главная" (многоязычные варианты)
                                const homeButtonKeywords = [
                                    'домой', 'home', 'главная', 'на главную',
                                    'ana sayfa', 'accueil', 'torna', 'inizio',
                                    'inicio', 'start', 'начало', 'вернуться',
                                    'go home', 'back home', 'return home',
                                    'الرئيسية', 'الصفحة الرئيسية'
                                ];
                                const hasHomeButton = homeButtonKeywords.some(keyword => 
                                    bodyText.includes(keyword.toLowerCase()) || 
                                    $('a, button').text().toLowerCase().includes(keyword.toLowerCase()) ||
                                    $('a[href*="index"], a[href*="home"], a[href*="/"]').length > 0
                                );
                                
                                // Дополнительные признаки страницы "Спасибо" по структуре:
                                // 1. Наличие иконок успеха (checkmark, success icon)
                                const hasSuccessIcon = $('[class*="success"], [class*="check"], [class*="tick"], [class*="done"]').length > 0 ||
                                                      htmlContent.includes('checkmark') ||
                                                      htmlContent.includes('success-icon');
                                
                                // 2. Структура страницы: обычно страница "Спасибо" короткая, с большим текстом благодарности
                                const pageLength = bodyText.length;
                                const hasShortContent = pageLength > 50 && pageLength < 2000; // Не слишком короткая и не слишком длинная
                                
                                // 3. Отсутствие навигационного меню или минимальное меню (часто на странице спасибо нет полного меню)
                                const navLinks = $('nav a, header a').length;
                                const hasMinimalNav = navLinks <= 3; // Минимальная навигация
                                
                                // Подсчитываем "баллы" для определения страницы "Спасибо"
                                let thankYouScore = 0;
                                if (hasThankYouText) thankYouScore += 3;
                                if (hasFormRedirect) thankYouScore += 2;
                                if (hasModal || hasModalInHtml) thankYouScore += 1;
                                if (hasHomeButton) thankYouScore += 2;
                                if (hasSuccessIcon) thankYouScore += 1;
                                if (hasShortContent && hasMinimalNav) thankYouScore += 1;
                                
                                // Если набрано достаточно баллов, считаем это страницей "Спасибо"
                                if (thankYouScore >= 3) {
                                    thankYouFound = true;
                                    if (hasFormRedirect && !hasModal && !hasModalInHtml) {
                                        thankYouType = 'page';
                                    } else if (hasModal || hasModalInHtml) {
                                        thankYouType = 'modal';
                                    } else {
                                        thankYouType = 'page';
                                    }
                                    break;
                                }
                                
                                // Старая логика для обратной совместимости
                                if (hasFormRedirect || (hasModal && hasThankYouText) || (hasModalInHtml && hasThankYouText && hasHomeButton)) {
                                    thankYouFound = true;
                                    thankYouType = hasFormRedirect && !hasModal ? 'page' : 'modal';
                                    break;
                                }
                                
                                if (hasThankYouText) {
                                    if (hasModal || hasModalInHtml) {
                                        // Это модальное окно
                                        thankYouFound = true;
                                        thankYouType = 'modal';
                                        break;
                                    } else if (hasHomeButton) {
                                        // Это отдельная страница (но не нашли по имени файла)
                                        thankYouFound = true;
                                        thankYouType = 'page';
                                        break;
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                
                result.ThankYouPage = thankYouFound;
                result.ThankYouPageType = thankYouType;
                
                // Парсинг меню и проверка элементов наполнения на каждой странице
                if (mainPagePath) {
                    try {
                        // Получаем список страниц из меню
                        const navPages = await parseNavigationPages(sitePath, mainPagePath);
                        
                        // Исключаем служебные страницы
                        const excludedPages = [
                            'index.html', 'light.html', 'home.html', // Главная (уже проверена отдельно)
                            'contact.html', 'contacts.html', 'iletisim.html', 'contatti.html', // Контакты (уже проверена)
                            'tesekkurler.html', 'thank-you.html', 'thanks.html', 'grazie.html', 'merci.html', // Спасибо
                            'spasibo.html', 'privacy', 'cookie', 'terms', 'gizlilik', 'cerez', 'kullanim' // Документы
                        ];
                        
                        const excludedKeywords = [
                            'index', 'light', 'home', // Главная
                            'contact', 'iletisim', 'contatti', // Контакты
                            'tesekkurler', 'thank', 'thanks', 'grazie', 'merci', 'spasibo', // Спасибо
                            'privacy', 'cookie', 'terms', 'gizlilik', 'cerez', 'kullanim', // Документы
                            'disclaimer', 'feragat', 'legal', 'yasal', 'policy', 'politik' // Документы
                        ];
                        
                        const contentPages = navPages.filter(page => {
                            const pageLower = page.toLowerCase();
                            // Исключаем страницы, которые содержат ключевые слова документов/служебных страниц
                            return !excludedKeywords.some(keyword => pageLower.includes(keyword.toLowerCase()));
                        });
                        
                        // Проверяем каждую страницу на количество элементов наполнения
                        for (const page of contentPages) {
                            try {
                                const pagePath = path.join(sitePath, page);
                                await fs.access(pagePath);
                                const elementData = await countDataElements(pagePath);
                                if (elementData.total > 0) {
                                    result.PagesDataElements[page] = elementData;
                                }
                            } catch (e) {
                                // Страница не найдена, пропускаем
                                continue;
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибку
                    }
                }
                
                console.log(`OK: ${site}`);
            }
        } catch (e) {
            console.log(`NOT FOUND: ${site}`);
        }
        
        results.push(result);
    }
    
    // Сортируем результаты так же, как папки в файловой системе (по алфавиту)
    results.sort((a, b) => {
        return a.Site.localeCompare(b.Site, 'ru', { numeric: true, sensitivity: 'base' });
    });
    
    return results;
}

async function generateReport(results, outputPath, basePath) {
    const currentDate = new Date().toLocaleString('ru-RU');
    
    // Нормализуем путь для правильной работы на Windows
    const normalizedOutputPath = path.normalize(outputPath);
    
    // Получаем базовый путь для относительных URL
    const reportDir = path.dirname(normalizedOutputPath);
    
    // Определяем, открыт ли отчет через сервер или как файл
    // Всегда используем режим сервера, если basePath передан (отчет открыт через /api/report)
    const isServerMode = !!basePath;
    
    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчет проверки сайтов</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        html {
            height: 100%;
            overflow: hidden;
        }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: #0a0a0a; 
            color: #e0e0e0; 
            padding: 0;
            overflow-x: hidden;
            overflow-y: auto;
            height: 100%;
            min-height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .header {
            background: #1a1a1a;
            padding: 15px 20px;
            border-bottom: 2px solid #2a2a2a;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .header h1 {
            color: #d4af37;
            font-size: 1.5em;
            margin: 0;
        }
        .header-info {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        .date-info {
            color: #999;
            font-size: 0.9em;
        }
        .content {
            flex: 1;
            overflow: auto;
            padding: 20px;
            position: relative;
        }
        .content.modal-open {
            overflow: hidden !important;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            background: #1a1a1a; 
            font-size: 0.9em;
            min-width: 100%;
        }
        th { 
            background: #2a2a2a; 
            color: #d4af37; 
            padding: 8px 6px; 
            text-align: center; 
            font-size: 0.75em; 
            position: sticky; 
            top: 0; 
            z-index: 10;
            white-space: normal;
            line-height: 1.3;
            vertical-align: middle;
        }
        td { 
            padding: 10px 8px; 
            border-bottom: 1px solid #333; 
            white-space: nowrap;
        }
        tr:hover { background: #222; }
        .ok { color: #4caf50; font-weight: bold; }
        .fail { color: #f44336; font-weight: bold; }
        .stat { text-align: center; font-weight: bold; }
        .site-name { 
            font-weight: bold; 
            color: #e0e0e0; 
            position: sticky; 
            left: 0; 
            background: #1a1a1a; 
            z-index: 5;
            padding-left: 20px;
            padding-right: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .site-favicon {
            width: 20px;
            height: 20px;
            object-fit: contain;
            border-radius: 2px;
            flex-shrink: 0;
        }
        tr:hover .site-name { background: #222; }
        .table-wrapper {
            overflow-x: auto;
            overflow-y: auto;
            width: 100%;
            height: 100%;
        }
        .view-btn {
            background: linear-gradient(135deg, #2196F3, #0b7dda);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            font-weight: bold;
            transition: all 0.3s;
        }
        .view-btn:hover {
            background: linear-gradient(135deg, #0b7dda, #0a6bc2);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
        }
        
        /* Модальное окно */
        .modal {
            display: none;
            position: fixed !important;
            z-index: 999999 !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            min-width: 100% !important;
            min-height: 100% !important;
            background-color: #000 !important;
            animation: fadeIn 0.3s;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            transform: none !important;
        }
        .modal.active {
            display: flex !important;
            align-items: stretch;
            justify-content: center;
        }
        body.modal-open {
            overflow: hidden !important;
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .modal-content {
            background: #1a1a1a;
            border-radius: 0;
            width: 100%;
            max-width: 430px;
            height: 100% !important;
            max-height: 100% !important;
            min-height: 100% !important;
            display: flex;
            flex-direction: column;
            box-shadow: none;
            animation: slideUp 0.3s;
            margin: 0;
            overflow: hidden;
            transition: max-width 0.3s ease;
            box-sizing: border-box;
            position: relative;
        }
        .modal-content.fullscreen {
            max-width: 100% !important;
            width: 100% !important;
        }
        @keyframes slideUp {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .modal-header {
            padding: 8px 12px;
            border-bottom: 2px solid #2a2a2a;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            background: #1a1a1a;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .modal-title-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .modal-favicon {
            width: 20px;
            height: 20px;
            object-fit: contain;
            border-radius: 2px;
        }
        .modal-header h2 {
            color: #d4af37;
            font-size: 0.9em;
            margin: 0;
            font-weight: normal;
        }
        .modal-header-buttons {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .fullscreen-btn, .refresh-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75em;
            font-weight: normal;
            transition: all 0.3s;
        }
        .fullscreen-btn:hover, .refresh-btn:hover {
            background: #45a049;
            transform: scale(1.05);
        }
        .fullscreen-btn.active {
            background: #2196F3;
        }
        .fullscreen-btn.active:hover {
            background: #0b7dda;
        }
        .close-btn {
            background: #f44336;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75em;
            font-weight: normal;
            transition: all 0.3s;
        }
        .close-btn:hover {
            background: #da190b;
            transform: scale(1.05);
        }
        .modal-iframe-container {
            flex: 1;
            padding: 0;
            display: flex;
            background: #0a0a0a;
            position: relative;
            overflow: hidden;
            min-height: 0;
        }
        .mobile-iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            background: white;
            flex: 1;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Отчет проверки структуры сайтов</h1>
        <div class="header-info">
            <span class="date-info">Дата: ${currentDate}</span>
        </div>
    </div>
    <div class="content">
        <div class="table-wrapper">
        <table>
        <tr>
            <th>Сайт</th>
            <th>Просмотр</th>
            <th>Контакты</th>
            <th>Документы</th>
            <th>Изображения</th>
            <th>Главная:<br>картинок</th>
            <th>Favicon</th>
            <th>Карта</th>
            <th>Форма</th>
            <th>Спасибо</th>
            <th>Тип<br>"Спасибо"</th>
            <th>Справ. инфо<br>в футере</th>
            <th>Элементы<br>на страницах</th>
        </tr>`;
    
    for (const r of results) {
        const contactClass = r.ContactPage ? 'ok' : 'fail';
        const contactSym = r.ContactPage ? '✓' : '✗';
        const mainPageImagesCount = r.MainPageImages || 0;
        const mainPageImagesClass = mainPageImagesCount >= 5 ? 'ok' : 'fail';
        const faviconClass = r.Favicon ? 'ok' : 'fail';
        const faviconSym = r.Favicon ? '✓' : '✗';
        const mapClass = r.ContactMap ? 'ok' : 'fail';
        const mapSym = r.ContactMap ? '✓' : '✗';
        const formClass = r.ContactForm ? 'ok' : 'fail';
        const formSym = r.ContactForm ? '✓' : '✗';
        const thankYouClass = r.ThankYouPage ? 'ok' : 'fail';
        const thankYouSym = r.ThankYouPage ? '✓' : '✗';
        const thankYouTypeText = r.ThankYouPageType === 'page' ? 'Страница' : 
                                 r.ThankYouPageType === 'modal' ? 'Всплывайка' : 
                                 r.ThankYouPage ? 'Неизвестно' : '-';
        const footerDocsClass = r.FooterDocuments ? 'ok' : 'fail';
        const footerDocsSym = r.FooterDocuments ? '✓' : '✗';
        
        // Формируем путь к сайту для iframe
        // Используем сохраненный путь к главной странице, если он есть
        let siteIndexPath;
        if (r.MainPagePath) {
            // Используем найденный путь к главной странице
            if (isServerMode && basePath) {
                // Путь через сервер: /sites/название_сайта/имя_файла.html
                const siteNameForUrl = encodeURIComponent(r.Site);
                const mainPageFileName = path.basename(r.MainPagePath);
                const basePathEncoded = encodeURIComponent(basePath);
                siteIndexPath = `/sites/${siteNameForUrl}/${mainPageFileName}?basePath=${basePathEncoded}`;
            } else {
                // Относительный путь для локального открытия
                const siteRelativePath = path.relative(reportDir, r.SitePath).replace(/\\/g, '/');
                const mainPageFileName = path.basename(r.MainPagePath);
                siteIndexPath = siteRelativePath + '/' + mainPageFileName;
            }
        } else {
            // Fallback: используем index.html если путь не найден
            if (isServerMode && basePath) {
                // Путь через сервер: /sites/название_сайта/index.html
                const siteNameForUrl = encodeURIComponent(r.Site);
                const basePathEncoded = encodeURIComponent(basePath);
                siteIndexPath = `/sites/${siteNameForUrl}/index.html?basePath=${basePathEncoded}`;
            } else {
                // Относительный путь для локального открытия
                const siteRelativePath = path.relative(reportDir, r.SitePath).replace(/\\/g, '/');
                siteIndexPath = siteRelativePath + '/index.html';
            }
        }
        
        // Экранируем для использования в JavaScript
        const siteIndexPathEscaped = siteIndexPath.replace(/'/g, "\\'").replace(/\\/g, '/');
        const siteNameEscaped = r.Site.replace(/'/g, "\\'");
        
        // Формируем путь к favicon для отображения
        let faviconPathForDisplay = '';
        if (r.FaviconPath) {
            // Используем сохраненный относительный путь, если он есть (из HTML)
            // Иначе вычисляем относительный путь от папки сайта
            let faviconRelative = r.FaviconRelativePath;
            if (!faviconRelative) {
                // Если относительный путь не сохранен, вычисляем его
                if (r.FaviconPath.startsWith(r.SitePath)) {
                    // Это полный путь, получаем относительный от папки сайта
                    faviconRelative = path.relative(r.SitePath, r.FaviconPath).replace(/\\/g, '/');
                } else {
                    // Это уже относительный путь
                    faviconRelative = r.FaviconPath;
                }
            }
            
            if (isServerMode && basePath) {
                // Путь через сервер
                const siteNameForUrl = encodeURIComponent(r.Site);
                const basePathEncoded = encodeURIComponent(basePath);
                faviconPathForDisplay = `/sites/${siteNameForUrl}/${faviconRelative}?basePath=${basePathEncoded}`;
            } else {
                // Относительный путь от отчета до favicon
                const siteRelativePath = path.relative(reportDir, r.SitePath).replace(/\\/g, '/');
                faviconPathForDisplay = siteRelativePath + '/' + faviconRelative;
            }
        }
        const faviconPathEscaped = faviconPathForDisplay ? faviconPathForDisplay.replace(/'/g, "\\'").replace(/\\/g, '/').replace(/"/g, '&quot;') : '';
        const faviconImgTag = faviconPathEscaped ? `<img src="${faviconPathEscaped}" alt="" class="site-favicon" onerror="this.style.display='none'">` : '';
        
        html += `<tr>
            <td class="site-name">${faviconImgTag}${r.Site}</td>
            <td class="stat">
                <button class="view-btn" onclick="openMobileView('${siteIndexPathEscaped}', '${siteNameEscaped}', '${faviconPathEscaped}')">📱 Просмотр</button>
            </td>
            <td class="stat ${contactClass}">${contactSym}</td>
            <td class="stat">${r.Documents}</td>
            <td class="stat">${r.Images}</td>
            <td class="stat ${mainPageImagesClass}">${mainPageImagesCount}</td>
            <td class="stat ${faviconClass}">${faviconSym}</td>
            <td class="stat ${mapClass}">${mapSym}</td>
            <td class="stat ${formClass}">${formSym}</td>
            <td class="stat ${thankYouClass}">${thankYouSym}</td>
            <td class="stat">${thankYouTypeText}</td>
            <td class="stat ${footerDocsClass}">${footerDocsSym}</td>
            <td class="stat" style="text-align: left; font-size: 0.7em; max-width: 400px; white-space: normal; padding: 8px;">
                ${Object.keys(r.PagesDataElements || {}).length > 0 
                    ? Object.entries(r.PagesDataElements).map(([page, data]) => 
                        `<strong>${page}</strong> - ${data.total}`
                    ).join('<br>')
                    : '-'}
            </td>
        </tr>`;
    }
    
    html += `</table></div></div>
    
    <!-- Модальное окно для мобильного просмотра -->
    <div id="mobileModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrapper">
                    <img id="modalFavicon" class="modal-favicon" src="" alt="" style="display: none;">
                    <h2 id="modalTitle"></h2>
                </div>
                <div class="modal-header-buttons">
                    <button class="refresh-btn" onclick="refreshMobileView()">🔄 Обновить</button>
                    <button class="fullscreen-btn" id="fullscreenBtn" onclick="toggleFullscreen()">💻 ПК вид</button>
                    <button class="close-btn" onclick="closeMobileView()">✕ Закрыть</button>
                </div>
            </div>
            <div class="modal-iframe-container">
                <iframe id="mobileIframe" class="mobile-iframe" src="" frameborder="0"></iframe>
            </div>
        </div>
    </div>
    
    <script>
        function openMobileView(sitePath, siteName, faviconPath) {
            // Проверяем, находимся ли мы внутри iframe
            const isInIframe = window.self !== window.top;
            
            if (isInIframe) {
                // Если внутри iframe, отправляем сообщение родительскому окну
                try {
                    window.parent.postMessage({
                        type: 'openMobileView',
                        sitePath: sitePath,
                        siteName: siteName,
                        faviconPath: faviconPath || ''
                    }, '*');
                    return;
                } catch (e) {
                    console.error('Не удалось открыть в родительском окне:', e);
                }
            }
            
            // Если не в iframe или не удалось открыть в родительском окне, открываем локально
            const modal = document.getElementById('mobileModal');
            const modalContent = document.querySelector('.modal-content');
            const iframe = document.getElementById('mobileIframe');
            const title = document.getElementById('modalTitle');
            const favicon = document.getElementById('modalFavicon');
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            const content = document.querySelector('.content');
            
            // Устанавливаем заголовок
            title.textContent = siteName;
            
            // Устанавливаем favicon
            if (faviconPath && favicon) {
                favicon.src = faviconPath;
                favicon.style.display = 'block';
                favicon.onerror = function() {
                    console.log('Favicon не загрузился:', faviconPath);
                    favicon.style.display = 'none';
                };
                favicon.onload = function() {
                    console.log('Favicon загружен:', faviconPath);
                };
            } else if (favicon) {
                favicon.style.display = 'none';
            }
            
            // Устанавливаем путь к сайту
            iframe.src = sitePath;
            
            // Сбрасываем полноэкранный режим при открытии
            modalContent.classList.remove('fullscreen');
            fullscreenBtn.classList.remove('active');
            fullscreenBtn.textContent = '💻 ПК вид';
            
            // Блокируем прокрутку всех контейнеров
            document.documentElement.style.overflow = 'hidden';
            document.documentElement.style.height = '100%';
            document.body.classList.add('modal-open');
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.height = '100%';
            document.body.style.top = '0';
            document.body.style.left = '0';
            if (content) {
                content.classList.add('modal-open');
                content.style.overflow = 'hidden';
            }
            
            // Показываем модальное окно
            modal.classList.add('active');
        }
        
        function refreshMobileView() {
            const iframe = document.getElementById('mobileIframe');
            if (iframe && iframe.src) {
                const currentSrc = iframe.src;
                iframe.src = '';
                setTimeout(() => {
                    iframe.src = currentSrc;
                }, 100);
            }
        }
        
        function toggleFullscreen() {
            const modalContent = document.querySelector('.modal-content');
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            
            if (modalContent.classList.contains('fullscreen')) {
                // Выходим из полноэкранного режима
                modalContent.classList.remove('fullscreen');
                fullscreenBtn.classList.remove('active');
                fullscreenBtn.textContent = '💻 ПК вид';
            } else {
                // Входим в полноэкранный режим
                modalContent.classList.add('fullscreen');
                fullscreenBtn.classList.add('active');
                fullscreenBtn.textContent = '📱 Мобильный вид';
            }
        }
        
        function closeMobileView() {
            const modal = document.getElementById('mobileModal');
            const modalContent = document.querySelector('.modal-content');
            const iframe = document.getElementById('mobileIframe');
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            const content = document.querySelector('.content');
            
            // Скрываем модальное окно
            modal.classList.remove('active');
            
            // Сбрасываем полноэкранный режим
            modalContent.classList.remove('fullscreen');
            fullscreenBtn.classList.remove('active');
            fullscreenBtn.textContent = '💻 ПК вид';
            
            // Очищаем iframe
            iframe.src = '';
            
            // Разблокируем прокрутку всех контейнеров
            document.documentElement.style.overflow = '';
            document.documentElement.style.height = '';
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
            document.body.style.top = '';
            document.body.style.left = '';
            if (content) {
                content.classList.remove('modal-open');
                content.style.overflow = '';
            }
        }
        
        // Закрытие по клику вне модального окна
        document.getElementById('mobileModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeMobileView();
            }
        });
        
        // Закрытие по клавише Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeMobileView();
            }
        });
    </script>
</body></html>`;
    
    // Убеждаемся, что директория существует перед записью файла
    try {
        await fs.mkdir(reportDir, { recursive: true });
    } catch (err) {
        // Если директория уже существует, это нормально
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
    
    // Записываем файл используя нормализованный путь
    await fs.writeFile(normalizedOutputPath, html, 'utf8');
    
    // Статистика для консоли
    const existing = results.filter(r => r.Exists).length;
    const withMain = results.filter(r => r.MainPage).length;
    const withContact = results.filter(r => r.ContactPage).length;
    const withFavicon = results.filter(r => r.Favicon).length;
    const withThankYou = results.filter(r => r.ThankYouPage).length;
    const withImages5 = results.filter(r => r.ImagesMin5).length;
    const withMainPageImages5 = results.filter(r => r.MainPageImagesMin5).length;
    const withMap = results.filter(r => r.ContactMap).length;
    const withForm = results.filter(r => r.ContactForm).length;
    
    return {
        total: results.length,
        existing,
        withMain,
        withContact,
        withFavicon,
        withThankYou,
        withImages5,
        withMainPageImages5,
        withMap,
        withForm,
        output: `Total sites: ${results.length}\nExisting: ${existing}\nWith main page: ${withMain}\nWith contact page: ${withContact}\nWith favicon: ${withFavicon}\nWith thank you page: ${withThankYou}\nWith ≥5 images (total): ${withImages5}\nWith ≥5 images on main page: ${withMainPageImages5}\nWith contact map: ${withMap}\nWith contact form: ${withForm}`
    };
}

// Если запускается напрямую
if (require.main === module) {
    const basePath = process.argv[2] || __dirname;
    checkSites(basePath)
        .then(results => generateReport(results, path.join(basePath, 'structure_report.html'), basePath))
        .then(stats => {
            console.log('\n' + stats.output);
            console.log('\nReport saved: structure_report.html');
        })
        .catch(console.error);
}

module.exports = { checkSites, generateReport, findSiteFolders };
