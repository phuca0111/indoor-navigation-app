// landing.js — WL0 mobile nav + active link + smooth scroll
document.addEventListener('DOMContentLoaded', function () {
    var mobileMenuBtn = document.getElementById('mobileMenuBtn');
    var mainNav = document.getElementById('mainNav');
    var authActions = document.getElementById('authActions');

    function closeMobileMenu() {
        if (mainNav) mainNav.classList.remove('active');
        if (authActions) authActions.classList.remove('show-mobile');
        if (mobileMenuBtn) mobileMenuBtn.textContent = '☰';
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
            }
        });
    }

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

    // CMS publish → hydrate menu / theme / SEO (fallback giữ HTML tĩnh nếu API lỗi)
    fetch('/api/website/public')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
            if (!data) return;
            if (data.theme) {
                var root = document.documentElement;
                if (data.theme.primary) root.style.setProperty('--landing-primary', data.theme.primary);
                if (data.theme.secondary) root.style.setProperty('--landing-secondary', data.theme.secondary);
                if (data.theme.radius) root.style.setProperty('--landing-radius', data.theme.radius);
                if (data.theme.font) document.body.style.fontFamily = data.theme.font + ', system-ui, sans-serif';
                if (data.theme.mode === 'dark') document.body.setAttribute('data-landing-theme', 'dark');
            }
            if (data.seo) {
                if (data.seo.meta_title) document.title = data.seo.meta_title;
                var desc = document.querySelector('meta[name="description"]');
                if (desc && data.seo.description) desc.setAttribute('content', data.seo.description);
                if (data.seo.robots) {
                    var robots = document.querySelector('meta[name="robots"]');
                    if (!robots) {
                        robots = document.createElement('meta');
                        robots.setAttribute('name', 'robots');
                        document.head.appendChild(robots);
                    }
                    robots.setAttribute('content', data.seo.robots);
                }
            }
            if (Array.isArray(data.navigation) && data.navigation.length && mainNav) {
                mainNav.innerHTML = data.navigation
                    .filter(function (item) {
                        if (item.enabled === false) return false;
                        var href = String(item.href || '').toLowerCase();
                        var label = String(item.label || '').toLowerCase();
                        // Không hiện tab Demo trên landing
                        return href.indexOf('demo') === -1 && label !== 'demo';
                    })
                    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
                    .map(function (item) {
                        var href = item.href || '/';
                        var active = (href.replace(/\/$/, '') || '/') === path ? ' class="active"' : '';
                        return '<a href="' + href + '"' + active + '>' + (item.label || '') + '</a>';
                    }).join('');
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
            if (data.settings && data.settings.site_name) {
                var logoText = document.querySelector('.logo-text');
                if (logoText) logoText.textContent = data.settings.site_name;
            }
            if (data.banner) {
                var heroTitle = document.querySelector('.hero-content h1');
                var heroDesc = document.querySelector('.hero-description');
                if (heroTitle && data.banner.homepage_title) heroTitle.textContent = data.banner.homepage_title;
                if (heroDesc && data.banner.homepage_subtitle) heroDesc.textContent = data.banner.homepage_subtitle;
            }
        })
        .catch(function () { /* giữ HTML tĩnh */ });
});
