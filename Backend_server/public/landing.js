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
});
