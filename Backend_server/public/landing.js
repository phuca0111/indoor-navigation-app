// landing.js — WL0 mobile nav + active link + smooth scroll
document.addEventListener('DOMContentLoaded', function () {
    var mobileMenuBtn = document.getElementById('mobileMenuBtn');
    var mainNav = document.getElementById('mainNav');
    var authActions = document.getElementById('authActions');
    var tokenLink = document.getElementById('landingTokens');
    if (!tokenLink) {
        tokenLink = document.createElement('link');
        tokenLink.id = 'landingTokens';
        tokenLink.rel = 'stylesheet';
        tokenLink.href = '/css/landing-tokens.css?v=20260721wq1';
        document.head.appendChild(tokenLink);
    }

    var main = document.querySelector('main,[role="main"]');
    if (!main) {
        main = document.createElement('main');
        var header = document.querySelector('body > header');
        var footer = document.querySelector('body > footer');
        var candidates = Array.from(document.body.children).filter(function (element) {
            return element !== header && element !== footer && element.tagName !== 'SCRIPT';
        });
        if (footer) document.body.insertBefore(main, footer);
        else document.body.appendChild(main);
        candidates.forEach(function (element) { main.appendChild(element); });
    }
    if (main) {
        if (!main.id) main.id = 'main-content';
        if (!main.querySelector('h1')) {
            var pageHeading = document.createElement('h1');
            pageHeading.className = 'landing-sr-only';
            pageHeading.textContent = document.title.split('|')[0].trim() || 'IndoorNav';
            main.insertBefore(pageHeading, main.firstChild);
        }
        var skip = document.querySelector('.skip-link');
        if (!skip) {
            skip = document.createElement('a');
            skip.className = 'skip-link';
            skip.href = '#' + main.id;
            skip.textContent = 'Bỏ qua điều hướng';
            document.body.insertBefore(skip, document.body.firstChild);
        }
        main.tabIndex = -1;
    }

    if (mobileMenuBtn) {
        if (!mainNav.id) mainNav.id = 'mainNav';
        mobileMenuBtn.setAttribute('aria-controls', mainNav.id);
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function closeMobileMenu(restoreFocus) {
        if (mainNav) mainNav.classList.remove('active');
        if (authActions) authActions.classList.remove('show-mobile');
        if (mobileMenuBtn) {
            mobileMenuBtn.textContent = '☰';
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            mobileMenuBtn.setAttribute('aria-label', 'Mở menu');
            if (restoreFocus) mobileMenuBtn.focus();
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function () {
            var open = mainNav && mainNav.classList.contains('active');
            if (open) {
                closeMobileMenu();
            } else {
                if (mainNav) mainNav.classList.add('active');
                if (authActions) authActions.classList.add('show-mobile');
                mobileMenuBtn.textContent = '✕';
                mobileMenuBtn.setAttribute('aria-expanded', 'true');
                mobileMenuBtn.setAttribute('aria-label', 'Đóng menu');
                setTimeout(function () {
                    var firstLink = mainNav && mainNav.querySelector('a');
                    if (firstLink) firstLink.focus();
                }, 0);
            }
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && mobileMenuBtn &&
            mobileMenuBtn.getAttribute('aria-expanded') === 'true') {
            event.preventDefault();
            closeMobileMenu(true);
        }
    });

    if (mainNav) {
        mainNav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeMobileMenu);
        });
    }
    if (authActions) {
        authActions.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeMobileMenu);
        });
    }

    var path = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav a').forEach(function (link) {
        var href = link.getAttribute('href') || '';
        if (href === path || (path === '/' && href === '/')) {
            link.classList.add('active');
        } else if (href.indexOf('/#') === 0 && path === '/') {
            /* anchor on home only */
        }
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href').substring(1);
            if (!targetId) return;
            var target = document.getElementById(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                closeMobileMenu();
            }
        });
    });

    // WL1: mở /features#editor (hoặc #dashboard / #android) → cuộn tới section
    if (window.location.hash) {
        var hashId = window.location.hash.replace(/^#/, '');
        var hashEl = hashId ? document.getElementById(hashId) : null;
        if (hashEl) {
            setTimeout(function () {
                hashEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }
    }

    function setText(selector, value) {
        var element = document.querySelector(selector);
        if (element && value !== undefined && value !== null && value !== '') {
            element.textContent = String(value);
        }
    }

    function safeHref(value, fallback) {
        var href = String(value || '');
        return /^(\/|#|https?:\/\/)/i.test(href) ? href : (fallback || '#');
    }

    function upsertMeta(attribute, key, content) {
        if (!content) return;
        var selector = 'meta[' + attribute + '="' + key + '"]';
        var meta = document.head.querySelector(selector);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute(attribute, key);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', String(content));
    }

    function upsertLink(rel, href, id) {
        if (!/^(\/|https?:\/\/)/i.test(String(href || ''))) return;
        var selector = id ? '#' + id : 'link[rel="' + rel + '"]';
        var link = document.head.querySelector(selector);
        if (!link) {
            link = document.createElement('link');
            if (id) link.id = id;
            link.rel = rel;
            document.head.appendChild(link);
        }
        link.href = href;
    }

    function applySeo(seo) {
        if (!seo) return;
        if (seo.meta_title) document.title = seo.meta_title;
        upsertMeta('name', 'description', seo.description);
        upsertMeta('name', 'keywords', seo.keywords);
        upsertMeta('name', 'robots', seo.robots);
        upsertMeta('property', 'og:title', seo.meta_title);
        upsertMeta('property', 'og:description', seo.description);
        upsertMeta('property', 'og:image', seo.og_image);
        upsertMeta('property', 'og:type', 'website');
        upsertMeta('property', 'og:url', window.location.href);
        upsertMeta('name', 'twitter:card', seo.og_image ? 'summary_large_image' : 'summary');
        upsertMeta('name', 'twitter:title', seo.meta_title);
        upsertMeta('name', 'twitter:description', seo.description);
        upsertMeta('name', 'twitter:image', seo.og_image);
        upsertLink('icon', seo.favicon, 'cmsFavicon');

        // Không thực thi HTML tùy ý. Chỉ kích hoạt Google Analytics khi tìm thấy Measurement ID hợp lệ.
        var measurement = String(seo.analytics_code || '').match(/\bG-[A-Z0-9]+\b/i);
        if (measurement && !document.getElementById('cmsGoogleAnalytics')) {
            var id = measurement[0].toUpperCase();
            var script = document.createElement('script');
            script.id = 'cmsGoogleAnalytics';
            script.async = true;
            script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
            document.head.appendChild(script);
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', id);
        }
    }

    function applyTheme(theme) {
        if (!theme) return;
        var root = document.documentElement;
        var primary = theme.primary || '#2563eb';
        var secondary = theme.secondary || '#0f172a';
        var radius = theme.radius || '12px';
        root.style.setProperty('--landing-primary', primary);
        root.style.setProperty('--landing-secondary', secondary);
        root.style.setProperty('--landing-radius', radius);
        root.style.setProperty('--accent', primary);
        root.style.setProperty('--accent-deep', primary);
        if (document.body.classList.contains('landing-home')) {
            document.body.style.setProperty('--accent', primary);
            document.body.style.setProperty('--accent-deep', primary);
            document.body.style.setProperty('--hero-0', secondary);
            if (theme.mode === 'dark') {
                document.body.style.setProperty('--paper', '#0b1120');
                document.body.style.setProperty('--paper-2', '#111827');
                document.body.style.setProperty('--surface', '#172033');
                document.body.style.setProperty('--ink', '#e5e7eb');
                document.body.style.setProperty('--ink-soft', '#aeb9c9');
                document.body.style.setProperty('--line', 'rgba(255,255,255,.12)');
            }
        }
        if (theme.font) {
            var font = String(theme.font).replace(/[^a-zA-ZÀ-ỹ0-9 _-]/g, '').trim();
            if (font) {
                document.body.style.fontFamily = '"' + font + '", system-ui, sans-serif';
                root.style.setProperty('--font-body', '"' + font + '", system-ui, sans-serif');
                if (/^[a-zA-Z0-9 _-]+$/.test(font)) {
                    upsertLink(
                        'stylesheet',
                        'https://fonts.googleapis.com/css2?family=' +
                            encodeURIComponent(font).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap',
                        'cmsThemeFont'
                    );
                }
            }
        }
        document.body.setAttribute('data-landing-theme', theme.mode === 'dark' ? 'dark' : 'light');
    }

    function googleMapUrl(value) {
        var raw = String(value || '').trim();
        var iframeSrc = raw.match(/src=["']([^"']+)["']/i);
        var url = iframeSrc ? iframeSrc[1] : raw;
        try {
            var parsed = new URL(url, window.location.origin);
            return /(^|\.)google\.[a-z.]+$/i.test(parsed.hostname) ||
                /(^|\.)googleusercontent\.com$/i.test(parsed.hostname)
                ? parsed.href
                : '';
        } catch (_) {
            return '';
        }
    }

    function applySiteSettings(settings) {
        if (!settings) return;
        document.querySelectorAll('.logo-text').forEach(function (element) {
            if (settings.site_name) element.textContent = settings.site_name;
        });
        if (/^(\/|https?:\/\/)/i.test(settings.logo_url || '')) {
            document.querySelectorAll('.logo-mark, .logo-icon').forEach(function (mark) {
                var image = document.createElement('img');
                image.className = 'cms-site-logo';
                image.src = settings.logo_url;
                image.alt = settings.site_name || 'Logo';
                mark.replaceWith(image);
            });
        }
        var footer = document.querySelector('footer');
        if (!footer) return;
        var firstText = footer.querySelector('p');
        if (firstText && settings.footer_text) firstText.textContent = settings.footer_text;
        var old = footer.querySelector('.cms-site-contact');
        if (old) old.remove();
        var hasContact = settings.email || settings.hotline || settings.facebook ||
            settings.youtube || settings.google_map;
        if (!hasContact) return;
        var contact = document.createElement('div');
        contact.className = 'cms-site-contact';
        var links = [
            [settings.email, 'mailto:' + settings.email, 'Email: ' + settings.email],
            [settings.hotline, 'tel:' + String(settings.hotline || '').replace(/\s+/g, ''), 'Hotline: ' + settings.hotline],
            [settings.facebook, safeHref(settings.facebook, '#'), 'Facebook'],
            [settings.youtube, safeHref(settings.youtube, '#'), 'YouTube']
        ];
        links.forEach(function (item) {
            if (!item[0]) return;
            var link = document.createElement('a');
            link.href = item[1];
            link.textContent = item[2];
            if (/^https?:/i.test(link.href)) {
                link.target = '_blank';
                link.rel = 'noopener';
            }
            contact.appendChild(link);
        });
        var mapUrl = googleMapUrl(settings.google_map);
        if (mapUrl) {
            var map = document.createElement('iframe');
            map.className = 'cms-site-map';
            map.src = mapUrl;
            map.loading = 'lazy';
            map.referrerPolicy = 'no-referrer-when-downgrade';
            map.title = 'Vị trí trên Google Maps';
            contact.appendChild(map);
        }
        var container = footer.querySelector('.container') || footer;
        container.appendChild(contact);
    }

    function youtubeVideoId(value) {
        try {
            var url = new URL(String(value || ''));
            if (/^(www\.)?(youtube\.com|youtube-nocookie\.com)$/i.test(url.hostname)) {
                if (url.pathname === '/watch') return url.searchParams.get('v') || '';
                var match = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,})/);
                return match ? match[1] : '';
            }
            if (/^(www\.)?youtu\.be$/i.test(url.hostname)) {
                return url.pathname.replace(/^\/+/, '').split('/')[0];
            }
        } catch (_) {
            return '';
        }
        return '';
    }

    function applyHeroVideo(value) {
        var hero = document.querySelector('.hero');
        if (!hero) return;
        var old = hero.querySelector('.cms-hero-video');
        if (old) old.remove();
        var url = String(value || '').trim();
        if (!url) return;
        var youtubeId = youtubeVideoId(url);
        var directVideo = /^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
        if (!youtubeId && !directVideo) return;
        var layer = document.createElement('div');
        layer.className = 'cms-hero-video';
        if (youtubeId) {
            var iframe = document.createElement('iframe');
            iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(youtubeId) +
                '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + encodeURIComponent(youtubeId) +
                '&playsinline=1&rel=0&modestbranding=1&origin=' +
                encodeURIComponent(window.location.origin);
            iframe.title = 'Video nền Hero';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.tabIndex = -1;
            layer.appendChild(iframe);
        } else {
            var video = document.createElement('video');
            video.src = url;
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.setAttribute('aria-hidden', 'true');
            layer.appendChild(video);
        }
        var shade = document.createElement('span');
        shade.className = 'cms-hero-video-shade';
        layer.appendChild(shade);
        hero.insertBefore(layer, hero.firstChild);
    }

    function applyHero(section, rootSelector) {
        if (!section) return;
        var root = document.querySelector(rootSelector);
        if (!root) return;
        root.hidden = section.enabled === false;
        var props = section.props || {};
        var title = root.querySelector('h1, h2');
        var subtitle = root.querySelector('.hero-description, .landing-muted, p:not(.brand-signal)');
        if (title && props.title) title.textContent = props.title;
        if (subtitle && props.subtitle) subtitle.textContent = props.subtitle;
        var buttons = root.querySelectorAll('.btn');
        if (buttons[0] && props.primary_cta) {
            buttons[0].textContent = props.primary_cta;
            buttons[0].setAttribute('href', safeHref(props.primary_href, '/login'));
        }
        if (buttons[1] && props.secondary_cta) {
            buttons[1].textContent = props.secondary_cta;
            buttons[1].setAttribute('href', safeHref(props.secondary_href, '/pricing'));
        }
        if (props.background) root.style.background = props.background;
        if (props.image && /^(\/|https?:\/\/)/i.test(props.image)) {
            root.style.backgroundImage = 'linear-gradient(rgba(5,15,25,.72),rgba(5,15,25,.72)),url("' +
                props.image.replace(/"/g, '%22') + '")';
            root.style.backgroundSize = 'cover';
            root.style.backgroundPosition = 'center';
        }
    }

    function applyHomeSections(sections) {
        var byId = {};
        sections.forEach(function (section) { byId[section.id] = section; });
        applyHero(byId.hero, '.hero');

        var features = byId.features;
        var featureRoot = document.querySelector('.why');
        if (features && featureRoot) {
            featureRoot.hidden = features.enabled === false;
            setText('.why .section-title', features.props && features.props.title);
            setText('.why .section-lead', features.props && features.props.subtitle);
            var featureItems = Array.isArray(features.props && features.props.items) ? features.props.items : [];
            var featureGrid = featureRoot.querySelector('.why-grid');
            if (featureGrid && featureItems.length) {
                featureGrid.innerHTML = featureItems.map(function (item, index) {
                    return '<article class="why-item reveal is-visible"><span class="why-index">' +
                        String(index + 1).padStart(2, '0') + '</span><h3></h3><p></p></article>';
                }).join('');
                featureGrid.querySelectorAll('.why-item').forEach(function (card, index) {
                    card.querySelector('h3').textContent = featureItems[index].title || '';
                    card.querySelector('p').textContent = featureItems[index].text || '';
                });
            }
        }

        var stats = byId.stats;
        var proof = document.querySelector('.proof');
        if (stats && proof) {
            proof.hidden = stats.enabled === false;
            setText('.proof .section-title', stats.props && stats.props.title);
            var statItems = Array.isArray(stats.props && stats.props.items) ? stats.props.items : [];
            var proofGrid = proof.querySelector('.proof-grid');
            if (proofGrid && statItems.length) {
                proofGrid.innerHTML = '';
                statItems.forEach(function (item) {
                    var card = document.createElement('div');
                    card.className = 'proof-item reveal is-visible';
                    var value = document.createElement('span');
                    value.className = 'proof-num';
                    value.textContent = item.value || '';
                    var label = document.createElement('span');
                    label.className = 'proof-label';
                    label.textContent = item.label || '';
                    card.append(value, label);
                    proofGrid.appendChild(card);
                });
            }
        }

        ['why', 'faq'].forEach(function (id) {
            var section = byId[id];
            if (!section) return;
            var old = document.querySelector('[data-cms-public-section="' + id + '"]');
            if (old) old.remove();
            if (section.enabled === false) return;
            var props = section.props || {};
            var wrapper = document.createElement('section');
            wrapper.className = 'cms-public-section';
            wrapper.setAttribute('data-cms-public-section', id);
            var container = document.createElement('div');
            container.className = 'container';
            var heading = document.createElement('h2');
            heading.className = 'section-title';
            heading.textContent = props.title || section.label || '';
            container.appendChild(heading);
            var grid = document.createElement('div');
            grid.className = 'cms-public-grid';
            (Array.isArray(props.items) ? props.items : []).forEach(function (item) {
                var card = document.createElement(id === 'faq' ? 'details' : 'article');
                if (id === 'faq') {
                    var summary = document.createElement('summary');
                    summary.textContent = item.q || '';
                    var answer = document.createElement('p');
                    answer.textContent = item.a || '';
                    card.append(summary, answer);
                } else {
                    var cardTitle = document.createElement('h3');
                    cardTitle.textContent = item.title || '';
                    var cardText = document.createElement('p');
                    cardText.textContent = item.text || '';
                    card.append(cardTitle, cardText);
                }
                grid.appendChild(card);
            });
            container.appendChild(grid);
            wrapper.appendChild(container);
            var anchor = document.querySelector('.cta-band, footer');
            if (anchor) anchor.parentNode.insertBefore(wrapper, anchor);
        });
    }

    function applyPublishedPage(data) {
        var pages = Array.isArray(data.pages) ? data.pages : [];
        var page = pages.find(function (item) {
            return (String(item.path || '').replace(/\/$/, '') || '/') === path;
        });
        if (!page || !Array.isArray(page.sections)) return;
        var sections = page.sections;
        var byId = {};
        sections.forEach(function (section) { byId[section.id] = section; });
        if (path === '/') applyHomeSections(sections);
        if (path === '/features') {
            applyHero(byId.hero, '.features-page-hero');
            var items = Array.isArray(byId.features && byId.features.props && byId.features.props.items)
                ? byId.features.props.items : [];
            document.querySelectorAll('.feature-detail').forEach(function (root, index) {
                if (!items[index]) return;
                var title = root.querySelector('h2');
                var text = root.querySelector('.feature-detail-copy > p');
                if (title) title.textContent = items[index].title || '';
                if (text) text.textContent = items[index].text || '';
            });
        }
        if (path === '/pricing') {
            applyHero(byId.hero, '.pricing-section');
            setText('.pricing-section .landing-muted', byId.pricing_note && byId.pricing_note.props &&
                byId.pricing_note.props.text);
        }
        if (path === '/contact') applyHero(byId.hero, '.contact-section');
        var footerSection = byId.footer;
        var footerText = document.querySelector('footer p');
        if (footerSection && footerText && footerSection.props && footerSection.props.text) {
            footerText.textContent = footerSection.props.text;
        }
    }

    function applyScheduledBanner(data) {
        if (path !== '/' || !Array.isArray(data.banners) || !data.banners.length) return;
        var banner = data.banners[0];
        var hero = document.querySelector('.hero');
        if (!hero) return;
        var title = hero.querySelector('.hero-content h1');
        var subtitle = hero.querySelector('.hero-description');
        var cta = hero.querySelector('.btn');
        var videoLayer = hero.querySelector('.cms-hero-video');
        var previous = {
            title: title && title.textContent,
            subtitle: subtitle && subtitle.textContent,
            backgroundImage: hero.style.backgroundImage,
            backgroundSize: hero.style.backgroundSize,
            backgroundPosition: hero.style.backgroundPosition,
            ctaHref: cta && cta.getAttribute('href'),
            ctaLabel: cta && cta.textContent,
            videoDisplay: videoLayer && videoLayer.style.display
        };
        hero.setAttribute('data-scheduled-banner', String(banner._id || 'active'));
        if (title) title.textContent = banner.title || banner.name || previous.title;
        if (subtitle) {
            subtitle.textContent = banner.subtitle || '';
            subtitle.style.whiteSpace = 'pre-line';
        }
        if (cta && banner.link_url) {
            cta.setAttribute('href', safeHref(banner.link_url, previous.ctaHref || '#'));
            if (banner.link_label) cta.textContent = banner.link_label;
        }
        if (banner.image_url && /^(\/|https?:\/\/)/i.test(banner.image_url)) {
            if (videoLayer) videoLayer.style.display = 'none';
            hero.style.backgroundImage =
                'linear-gradient(rgba(5,15,25,.76),rgba(5,15,25,.76)),url("' +
                banner.image_url.replace(/"/g, '%22') + '")';
            hero.style.backgroundSize = 'cover';
            hero.style.backgroundPosition = 'center';
        }
        if (banner.ends_at) {
            var remaining = new Date(banner.ends_at).getTime() - Date.now();
            if (remaining > 0 && remaining <= 2147483647) {
                window.setTimeout(function () {
                    hero.removeAttribute('data-scheduled-banner');
                    if (title) title.textContent = previous.title || '';
                    if (subtitle) {
                        subtitle.textContent = previous.subtitle || '';
                        subtitle.style.whiteSpace = '';
                    }
                    hero.style.backgroundImage = previous.backgroundImage;
                    hero.style.backgroundSize = previous.backgroundSize;
                    hero.style.backgroundPosition = previous.backgroundPosition;
                    if (cta) {
                        cta.setAttribute('href', previous.ctaHref || '#');
                        cta.textContent = previous.ctaLabel || '';
                    }
                    if (videoLayer) videoLayer.style.display = previous.videoDisplay || '';
                }, remaining);
            }
        }
    }

    function applyPublishedArticles(data) {
        if (path !== '/' || !Array.isArray(data.articles) || !data.articles.length) return;
        var old = document.getElementById('cmsPublishedArticles');
        if (old) old.remove();
        var section = document.createElement('section');
        section.id = 'cmsPublishedArticles';
        section.className = 'cms-public-section';
        var container = document.createElement('div');
        container.className = 'container';
        var heading = document.createElement('h2');
        heading.className = 'section-title';
        heading.textContent = 'Blog & Tin tức';
        var grid = document.createElement('div');
        grid.className = 'cms-public-grid';
        data.articles.forEach(function (article) {
            var card = document.createElement('a');
            card.className = 'cms-public-article-card';
            card.href = '/blog/' + encodeURIComponent(article.slug || '');
            if (article.featured_image && /^(\/|https?:\/\/)/i.test(article.featured_image)) {
                var image = document.createElement('img');
                image.className = 'cms-public-article-image';
                image.src = article.featured_image;
                image.alt = article.title || '';
                card.appendChild(image);
            }
            var type = document.createElement('small');
            type.textContent = article.type === 'NEWS' ? 'TIN TỨC' : 'BLOG';
            var title = document.createElement('h3');
            title.textContent = article.title || '';
            var excerpt = document.createElement('p');
            excerpt.textContent = article.excerpt || '';
            card.append(type, title, excerpt);
            grid.appendChild(card);
        });
        container.append(heading, grid);
        section.appendChild(container);
        var anchor = document.querySelector('.cta-band, footer');
        if (anchor) anchor.parentNode.insertBefore(section, anchor);
    }

    // CMS publish → hydrate menu / theme / SEO (fallback giữ HTML tĩnh nếu API lỗi)
    fetch('/api/website/public?t=' + Date.now(), { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
            if (!data) return;
            applyTheme(data.theme);
            applySeo(data.seo);
            if (Array.isArray(data.navigation) && data.navigation.length && mainNav) {
                var navigation = data.navigation
                    .filter(function (item) {
                        if (item.enabled === false) return false;
                        var href = String(item.href || '').toLowerCase();
                        var label = String(item.label || '').toLowerCase();
                        // Không hiện tab Demo trên landing
                        return href.indexOf('demo') === -1 && label !== 'demo';
                    })
                    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
                mainNav.replaceChildren();
                navigation.forEach(function (item) {
                    var href = safeHref(item.href, '/');
                    var link = document.createElement('a');
                    link.href = href;
                    link.textContent = String(item.label || '');
                    if ((href.replace(/\/$/, '') || '/') === path) link.className = 'active';
                    mainNav.appendChild(link);
                });
                mainNav.querySelectorAll('a').forEach(function (link) {
                    link.addEventListener('click', closeMobileMenu);
                });
            }
            // Ẩn nút «Dùng thử» cạnh Đăng nhập; CTA miễn phí → /login
            document.querySelectorAll('#trialBtn, a.auth-btn.register-btn:not(.org-register-btn)').forEach(function (el) {
                var href = (el.getAttribute('href') || '').toLowerCase();
                var text = (el.textContent || '').trim().toLowerCase();
                if (href.indexOf('org-trial') !== -1 || text === 'dùng thử' || el.id === 'trialBtn') {
                    el.style.display = 'none';
                }
            });
            document.querySelectorAll('a.btn').forEach(function (el) {
                var text = (el.textContent || '').trim().toLowerCase();
                if (text.indexOf('dùng thử miễn phí') !== -1) {
                    el.setAttribute('href', '/login');
                }
            });
            if (data.banner && data.banner.cta_href) {
                document.querySelectorAll('a.btn.btn-primary').forEach(function (el) {
                    var text = (el.textContent || '').trim().toLowerCase();
                    if (text.indexOf('dùng thử') !== -1) {
                        el.setAttribute('href', data.banner.cta_href.indexOf('org-trial') !== -1 ? '/login' : data.banner.cta_href);
                        if (data.banner.cta_label) el.textContent = data.banner.cta_label;
                    }
                });
            }
            applyPublishedPage(data);
            applySiteSettings(data.settings);
            if (data.banner) {
                var heroTitle = document.querySelector('.hero-content h1');
                var heroDesc = document.querySelector('.hero-description');
                var heroRoot = document.querySelector('.hero');
                if (heroTitle && data.banner.homepage_title) heroTitle.textContent = data.banner.homepage_title;
                if (heroDesc && data.banner.homepage_subtitle) heroDesc.textContent = data.banner.homepage_subtitle;
                var heroImage = data.banner.hero_image || '';
                if (!heroImage && /^(\/|https?:\/\/)/i.test(data.banner.background || '')) {
                    heroImage = data.banner.background;
                }
                if (heroRoot && /^(\/|https?:\/\/)/i.test(heroImage)) {
                    heroRoot.style.backgroundImage =
                        'linear-gradient(rgba(5,15,25,.76),rgba(5,15,25,.76)),url("' +
                        heroImage.replace(/"/g, '%22') + '")';
                    heroRoot.style.backgroundSize = 'cover';
                    heroRoot.style.backgroundPosition = 'center';
                } else if (
                    heroRoot &&
                    data.banner.background &&
                    window.CSS &&
                    CSS.supports('background', data.banner.background)
                ) {
                    heroRoot.style.background = data.banner.background;
                }
                applyHeroVideo(data.banner.hero_video);
            }
            applyScheduledBanner(data);
            applyPublishedArticles(data);
        })
        .catch(function () { /* giữ HTML tĩnh */ });
});
