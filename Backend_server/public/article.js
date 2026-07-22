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
        if (title) document.title = title;
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

    function renderArticle(article) {
        var root = document.getElementById('publicArticle');
        if (!root) return;
        root.innerHTML = '';
        if (/^(\/|https?:\/\/)/i.test(article.featured_image || '')) {
            var image = document.createElement('img');
            image.className = 'public-article-cover';
            image.src = article.featured_image;
            image.alt = article.title || '';
            root.appendChild(image);
        }
        var body = document.createElement('div');
        body.className = 'public-article-body';
        var type = document.createElement('div');
        type.className = 'public-article-type';
        type.textContent = article.type === 'NEWS' ? 'TIN TỨC' : 'BLOG';
        var title = document.createElement('h1');
        title.textContent = article.title || '';
        var meta = document.createElement('p');
        meta.className = 'public-article-meta';
        meta.textContent = article.published_at
            ? 'Xuất bản ' + new Date(article.published_at).toLocaleString('vi-VN')
            : '';
        body.append(type, title, meta);
        if (article.excerpt) {
            var excerpt = document.createElement('p');
            excerpt.className = 'public-article-excerpt';
            excerpt.textContent = article.excerpt;
            body.appendChild(excerpt);
        }
        var content = document.createElement('div');
        content.className = 'public-article-content';
        content.textContent = article.content || '';
        body.appendChild(content);
        root.appendChild(body);
    }

    function renderError(message) {
        var root = document.getElementById('publicArticle');
        if (!root) return;
        root.innerHTML = '';
        var error = document.createElement('div');
        error.className = 'article-error';
        var title = document.createElement('h1');
        title.textContent = 'Không thể mở bài viết';
        var text = document.createElement('p');
        text.textContent = message || 'Bài viết không tồn tại hoặc chưa được xuất bản.';
        error.append(title, text);
        root.appendChild(error);
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
