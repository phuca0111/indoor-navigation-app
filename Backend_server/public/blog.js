(function () {
    function typeLabel(type) {
        return type === 'NEWS' ? 'Tin tức' : 'Blog';
    }

    function renderEmpty(grid, message) {
        grid.innerHTML = '';
        var empty = document.createElement('p');
        empty.className = 'col-span-full text-center font-body-md text-on-surface-variant py-16';
        empty.textContent = message || 'Chưa có bài viết xuất bản.';
        grid.appendChild(empty);
    }

    function renderArticles(items) {
        var grid = document.getElementById('blogGrid');
        if (!grid) return;
        if (!items.length) {
            renderEmpty(grid);
            return;
        }
        grid.innerHTML = '';
        items.forEach(function (article) {
            var card = document.createElement('article');
            card.className = 'blog-list-card bg-surface-container-lowest border border-hairline-border rounded-[24px] overflow-hidden flex flex-col';

            var media = document.createElement('div');
            media.className = 'aspect-[16/10] overflow-hidden bg-mist-gray';
            if (article.featured_image && /^(\/|https?:\/\/)/i.test(article.featured_image)) {
                var img = document.createElement('img');
                img.className = 'w-full h-full object-cover';
                img.src = article.featured_image;
                img.alt = article.title || '';
                img.loading = 'lazy';
                media.appendChild(img);
            }

            var body = document.createElement('div');
            body.className = 'p-component-padding flex flex-col flex-grow';

            var type = document.createElement('span');
            type.className = 'font-label-mono text-label-mono uppercase tracking-widest text-on-surface-variant mb-4';
            type.textContent = typeLabel(article.type);

            var title = document.createElement('h3');
            title.className = 'font-headline-md text-[22px] md:text-[24px] leading-[30px] font-semibold text-deep-charcoal mb-3';
            title.textContent = article.title || '';

            var excerpt = document.createElement('p');
            excerpt.className = 'font-body-md text-body-md text-on-surface-variant mb-6 line-clamp-3';
            excerpt.textContent = article.excerpt || '';

            var moreWrap = document.createElement('div');
            moreWrap.className = 'mt-auto';
            var more = document.createElement('a');
            more.className = 'font-label-mono text-label-mono uppercase tracking-widest text-primary border-b border-primary/20 hover:border-primary transition-all pb-1 inline-flex items-center gap-2 group';
            more.href = '/blog/' + encodeURIComponent(article.slug || '');
            more.innerHTML = 'Đọc tiếp<span class="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform" aria-hidden="true">arrow_forward</span>';
            moreWrap.appendChild(more);

            body.append(type, title, excerpt, moreWrap);
            card.append(media, body);
            grid.appendChild(card);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var grid = document.getElementById('blogGrid');
        if (!grid) return;

        fetch('/api/website/public/articles?limit=24', { cache: 'no-store' })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (body) {
                    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
                    return Array.isArray(body.items) ? body.items : [];
                });
            })
            .then(renderArticles)
            .catch(function () {
                renderEmpty(grid, 'Không tải được danh sách bài viết. Thử lại sau.');
            });

        var form = document.getElementById('blogNewsletter');
        if (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                window.location.href = '/contact';
            });
        }
    });
})();
