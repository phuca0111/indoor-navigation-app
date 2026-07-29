(function () {
    function setMeta(attribute, name, content) {
        if (!content) return;
        var selector = 'meta[' + attribute + '="' + name + '"]';
        var element = document.head.querySelector(selector);
        if (!element) {
            element = document.createElement('meta');
            element.setAttribute(attribute, name);
            document.head.appendChild(element);
        }
        element.setAttribute('content', String(content));
    }

    function applyArticleSeo(article) {
        var seo = article.seo || {};
        var title = seo.meta_title || article.title;
        var description = seo.meta_description || article.excerpt;
        var image = seo.og_image || article.featured_image;
        if (title) document.title = title + ' | IndoorNav';
        setMeta('name', 'description', description);
        setMeta('name', 'keywords', Array.isArray(seo.keywords) ? seo.keywords.join(', ') : seo.keywords);
        setMeta('name', 'robots', seo.robots || 'index,follow');
        setMeta('property', 'og:title', seo.og_title || title);
        setMeta('property', 'og:description', seo.og_description || description);
        setMeta('property', 'og:image', image);
        setMeta('property', 'og:type', 'article');
        setMeta('property', 'og:url', window.location.href);
        if (/^https?:\/\//i.test(seo.canonical_url || '')) {
            var canonical = document.head.querySelector('link[rel="canonical"]') || document.createElement('link');
            canonical.rel = 'canonical';
            canonical.href = seo.canonical_url;
            if (!canonical.parentNode) document.head.appendChild(canonical);
        }
    }

    function formatPublishedDate(value) {
        if (!value) return '';
        try {
            return new Date(value).toLocaleDateString('vi-VN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch (e) {
            return '';
        }
    }

    function typeLabel(type) {
        return type === 'NEWS' ? 'Tin tức' : 'Blog';
    }

    function appendParagraphs(container, text) {
        var raw = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!raw) return;
        var blocks = raw.split(/\n{2,}/);
        if (blocks.length === 1) {
            blocks = raw.split(/\n/).filter(function (line) { return line.trim(); });
        }
        blocks.forEach(function (block) {
            var p = document.createElement('p');
            p.textContent = block.trim();
            container.appendChild(p);
        });
    }

    function renderArticleNav() {
        var nav = document.createElement('div');
        nav.className = 'mt-20 pt-8 border-t border-hairline-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4';

        var back = document.createElement('a');
        back.className = 'font-label-mono text-label-mono uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors inline-flex items-center gap-2 group';
        back.href = '/blog';
        back.innerHTML = '<span class="material-symbols-outlined text-[16px] group-hover:-translate-x-1 transition-transform" aria-hidden="true">chevron_left</span>Quay lại danh sách';

        var contact = document.createElement('a');
        contact.className = 'font-label-mono text-label-mono uppercase tracking-widest text-primary hover:text-secondary transition-colors font-semibold inline-flex items-center gap-2 group';
        contact.href = '/contact';
        contact.innerHTML = 'Liên hệ tư vấn<span class="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform" aria-hidden="true">chevron_right</span>';

        nav.append(back, contact);
        return nav;
    }

    function renderArticle(article) {
        var root = document.getElementById('publicArticle');
        if (!root) return;
        root.innerHTML = '';

        var crumb = document.createElement('a');
        crumb.className = 'inline-flex items-center gap-2 font-label-mono text-label-mono uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors mb-12';
        crumb.href = '/blog';
        crumb.innerHTML = '<span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>Blog &amp; Tin tức';

        var header = document.createElement('header');
        header.className = 'mb-12';

        var badge = document.createElement('div');
        badge.className = 'inline-block bg-mist-gray text-deep-charcoal font-label-mono text-label-mono px-3 py-1 rounded-full uppercase tracking-widest mb-6';
        badge.textContent = typeLabel(article.type);

        var title = document.createElement('h1');
        title.className = 'font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-deep-charcoal mb-6 leading-tight';
        title.textContent = article.title || '';

        var date = document.createElement('p');
        date.className = 'font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest';
        date.textContent = formatPublishedDate(article.published_at);

        header.append(badge, title);
        if (date.textContent) header.appendChild(date);

        root.append(crumb, header);

        if (/^(\/|https?:\/\/)/i.test(article.featured_image || '')) {
            var coverWrap = document.createElement('div');
            coverWrap.className = 'mb-16';
            var image = document.createElement('img');
            image.className = 'w-full aspect-[16/9] object-cover rounded-[24px] bg-mist-gray';
            image.src = article.featured_image;
            image.alt = article.title || '';
            coverWrap.appendChild(image);
            root.appendChild(coverWrap);
        }

        var body = document.createElement('div');
        body.className = 'article-body-prose font-body-lg text-body-lg text-on-surface leading-relaxed';

        if (article.excerpt) {
            var excerpt = document.createElement('p');
            excerpt.className = 'text-on-surface-variant';
            excerpt.textContent = article.excerpt;
            body.appendChild(excerpt);
        }

        appendParagraphs(body, article.content);
        root.appendChild(body);
        root.appendChild(renderArticleNav());
    }

    function renderError(message) {
        var root = document.getElementById('publicArticle');
        if (!root) return;
        root.innerHTML = '';

        var crumb = document.createElement('a');
        crumb.className = 'inline-flex items-center gap-2 font-label-mono text-label-mono uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors mb-12';
        crumb.href = '/blog';
        crumb.innerHTML = '<span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>Blog &amp; Tin tức';

        var error = document.createElement('div');
        error.className = 'text-center py-8';
        var title = document.createElement('h1');
        title.className = 'font-headline-md text-headline-md text-deep-charcoal mb-4';
        title.textContent = 'Không thể mở bài viết';
        var text = document.createElement('p');
        text.className = 'font-body-md text-on-surface-variant mb-10';
        text.textContent = message || 'Bài viết không tồn tại hoặc chưa được xuất bản.';
        error.append(title, text);

        root.append(crumb, error);
        root.appendChild(renderArticleNav());
    }

    document.addEventListener('DOMContentLoaded', function () {
        var parts = window.location.pathname.split('/').filter(Boolean);
        var slug = parts[0] === 'blog' ? decodeURIComponent(parts.slice(1).join('/')) : '';
        if (!slug) {
            renderError('Đường dẫn bài viết không hợp lệ.');
            return;
        }
        fetch('/api/website/public/articles/' + encodeURIComponent(slug), { cache: 'no-store' })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (body) {
                    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
                    return body.item;
                });
            })
            .then(function (article) {
                renderArticle(article);
                applyArticleSeo(article);
            })
            .catch(function (error) {
                renderError(error.message);
            });
    });
})();
