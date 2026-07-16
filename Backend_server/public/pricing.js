// pricing.js — WL2: render gói từ GET /api/billing/plans (cùng nguồn planCatalog)
(function () {
    var FALLBACK_PLANS = [
        {
            code: 'FREE',
            name: 'Free / Trial',
            description: 'Gói dùng thử',
            price_vnd: 0,
            period_days: 30,
            max_buildings: 2,
            max_users: 5,
            features: ['2 tòa nhà', '5 tài khoản', 'Draft + Publish']
        },
        {
            code: 'PRO',
            name: 'Professional',
            description: 'Gói chuyên nghiệp',
            price_vnd: 990000,
            period_days: 30,
            max_buildings: 20,
            max_users: 50,
            features: ['20 tòa nhà', '50 tài khoản', 'Hỗ trợ triển khai cơ bản']
        },
        {
            code: 'ENTERPRISE',
            name: 'Enterprise',
            description: 'Gói doanh nghiệp không giới hạn cơ bản',
            price_vnd: 4990000,
            period_days: 30,
            max_buildings: null,
            max_users: null,
            features: ['Không giới hạn tòa/user (theo chính sách)', 'Tùy chỉnh onboarding']
        }
    ];

    function formatVnd(n) {
        var v = Number(n) || 0;
        return v.toLocaleString('vi-VN');
    }

    function buildFeatureList(plan) {
        var feats = Array.isArray(plan.features) ? plan.features.slice() : [];
        if (!feats.length) {
            if (plan.max_buildings != null) feats.push(plan.max_buildings + ' tòa nhà');
            else feats.push('Không giới hạn tòa nhà (theo chính sách)');
            if (plan.max_users != null) feats.push(plan.max_users + ' tài khoản');
            else feats.push('Không giới hạn tài khoản (theo chính sách)');
        }
        return feats;
    }

    function ctaFor(plan) {
        var code = String(plan.code || '').toUpperCase();
        if (code === 'FREE') {
            return { href: '/org-trial.html', label: 'Dùng thử', primary: true };
        }
        if (code === 'PRO') {
            return { href: '/contact', label: 'Hỏi thêm', primary: false };
        }
        return { href: '/contact', label: 'Liên hệ', primary: false };
    }

    function renderPlanCard(plan) {
        var code = String(plan.code || '').toUpperCase();
        var feats = buildFeatureList(plan);
        var cta = ctaFor(plan);
        var featured = code === 'PRO' ? ' plan-featured' : '';
        var period = plan.period_days ? ('/ ' + plan.period_days + ' ngày') : '/ tháng';
        var li = feats.map(function (f) {
            return '<li>' + escapeHtml(String(f)) + '</li>';
        }).join('');

        return (
            '<article class="plan-card' + featured + '" data-plan="' + escapeHtml(code) + '">' +
            '<span class="plan-code">' + escapeHtml(code) + '</span>' +
            '<div class="plan-title">' + escapeHtml(plan.name || code) + '</div>' +
            '<div class="plan-price">' + formatVnd(plan.price_vnd) +
            ' <span style="font-size:14px;font-weight:600;color:#6b7280;">VND</span></div>' +
            '<div class="plan-period">' + escapeHtml(period) + '</div>' +
            '<div class="plan-desc">' + escapeHtml(plan.description || '') + '</div>' +
            '<ul class="plan-features">' + li + '</ul>' +
            '<div class="plan-cta">' +
            '<a class="btn ' + (cta.primary ? 'btn-primary' : 'btn-secondary') +
            ' btn-large" href="' + cta.href + '">' + escapeHtml(cta.label) + '</a>' +
            '</div></article>'
        );
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setStatus(el, text, kind) {
        if (!el) return;
        el.textContent = text || '';
        el.className = 'pricing-status' + (kind ? ' is-' + kind : '');
    }

    function paint(plans, statusEl, sourceLabel) {
        var grid = document.getElementById('pricingGrid');
        if (!grid) return;
        var sorted = plans.slice().sort(function (a, b) {
            return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
        });
        if (!sorted.length) sorted = FALLBACK_PLANS;
        grid.innerHTML = sorted.map(renderPlanCard).join('');
        setStatus(statusEl, sourceLabel, sourceLabel.indexOf('dự phòng') >= 0 ? 'error' : 'ok');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var statusEl = document.getElementById('pricingStatus');
        setStatus(statusEl, 'Đang tải bảng giá từ Billing…');

        fetch('/api/billing/plans')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                var plans = (data && data.plans) || [];
                if (!plans.length) throw new Error('empty');
                paint(plans, statusEl, 'Đồng bộ từ catalog Billing (planCatalog).');
            })
            .catch(function () {
                paint(FALLBACK_PLANS, statusEl, 'API tạm lỗi — đang dùng bảng giá dự phòng (khớp FALLBACK Billing).');
            });
    });
})();
