// pricing.js — render gói từ GET /api/billing/plans (Aura Precision cards)
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

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

    function tagFor(code) {
        if (code === 'FREE') {
            return {
                label: 'Cá nhân / dùng thử',
                className: 'bg-mist-gray text-on-surface-variant'
            };
        }
        if (code === 'PRO') {
            return {
                label: 'Tổ chức',
                className: 'bg-secondary-container/10 text-secondary'
            };
        }
        return {
            label: 'Doanh nghiệp',
            className: 'bg-mist-gray text-on-surface-variant'
        };
    }

    function priceHeadline(plan, code) {
        var price = Number(plan.price_vnd) || 0;
        if (code === 'FREE' || price === 0) return 'Miễn phí';
        if (code === 'ENTERPRISE') return 'Liên hệ';
        return formatVnd(price) + ' VND';
    }

    function periodLine(plan, code) {
        if (code === 'FREE' || code === 'ENTERPRISE') return escapeHtml(plan.description || '');
        var period = plan.period_days ? ('/ ' + plan.period_days + ' ngày') : '/ tháng';
        return escapeHtml(period + (plan.description ? ' · ' + plan.description : ''));
    }

    function ctaFor(plan) {
        var code = String(plan.code || '').toUpperCase();
        if (code === 'FREE') {
            return { href: '/login', label: 'Dùng thử miễn phí', primary: false };
        }
        if (code === 'PRO') {
            return { href: '/contact', label: 'Nâng cấp', primary: true };
        }
        return { href: '/contact', label: 'Liên hệ tư vấn', primary: false };
    }

    function renderPlanCard(plan) {
        var code = String(plan.code || '').toUpperCase();
        var feats = buildFeatureList(plan);
        var cta = ctaFor(plan);
        var tag = tagFor(code);
        var featured = code === 'PRO' ? ' pricing-card--featured ring-1 ring-hairline-border' : '';
        var li = feats.map(function (f) {
            return (
                '<li class="flex items-start gap-3 text-on-surface-variant font-body-md">' +
                '<span class="material-symbols-outlined text-secondary shrink-0 mt-0.5" style="font-size:20px" aria-hidden="true">check_circle</span>' +
                '<span>' + escapeHtml(String(f)) + '</span>' +
                '</li>'
            );
        }).join('');

        var ctaClass = cta.primary
            ? 'w-full block text-center bg-deep-charcoal text-white py-4 rounded-full font-body-md hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-deep-charcoal/5'
            : 'w-full block text-center border border-deep-charcoal text-deep-charcoal py-4 rounded-full font-body-md hover:bg-deep-charcoal hover:text-white transition-all active:scale-95';

        return (
            '<article class="pricing-card plan-card bg-white border border-hairline-border rounded-[24px] p-8 md:p-10 flex flex-col h-full' +
            featured +
            '" data-plan="' + escapeHtml(code) + '">' +
            '<div class="mb-8">' +
            '<span class="font-label-mono text-label-mono px-4 py-1.5 rounded-full uppercase ' +
            tag.className +
            '">' +
            escapeHtml(tag.label) +
            '</span>' +
            '<p class="font-label-mono text-[10px] uppercase tracking-widest text-outline mt-4">' +
            escapeHtml(code) +
            (plan.name ? ' · ' + escapeHtml(plan.name) : '') +
            '</p>' +
            '<h3 class="font-headline-lg text-3xl md:text-headline-lg text-deep-charcoal mt-3">' +
            escapeHtml(priceHeadline(plan, code)) +
            '</h3>' +
            '<p class="font-body-md text-sm text-on-surface-variant mt-2">' +
            periodLine(plan, code) +
            '</p>' +
            '</div>' +
            '<ul class="space-y-4 mb-10 md:mb-12 flex-grow list-none p-0 m-0 plan-features">' +
            li +
            '</ul>' +
            '<div class="plan-cta mt-auto">' +
            '<a class="' + ctaClass + '" href="' + cta.href + '">' +
            escapeHtml(cta.label) +
            '</a>' +
            '</div></article>'
        );
    }

    function setStatus(el, text, kind) {
        if (!el) return;
        el.textContent = text || '';
        el.hidden = !text;
        el.className =
            'pricing-status text-center mt-8 font-label-mono text-label-mono text-on-surface-variant' +
            (kind ? ' is-' + kind : '');
    }

    function paint(plans, statusEl, sourceLabel) {
        var grid = document.getElementById('pricingGrid');
        if (!grid) return;
        var sorted = plans.slice().sort(function (a, b) {
            return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
        });
        if (!sorted.length) sorted = FALLBACK_PLANS;
        grid.innerHTML = sorted.map(renderPlanCard).join('');
        setStatus(
            statusEl,
            sourceLabel,
            sourceLabel && sourceLabel.indexOf('dự phòng') >= 0 ? 'error' : sourceLabel ? 'ok' : ''
        );
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
                paint(plans, statusEl, '');
            })
            .catch(function () {
                paint(
                    FALLBACK_PLANS,
                    statusEl,
                    'API tạm lỗi — đang dùng bảng giá dự phòng (khớp FALLBACK Billing).'
                );
            });
    });
})();
