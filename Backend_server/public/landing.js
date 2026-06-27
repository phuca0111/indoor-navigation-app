// landing.js - Xử lý mobile menu toggle
// Kiểm tra DOM đã load xong
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainNav = document.getElementById('mainNav');

    if (mobileMenuBtn && mainNav) {
        mobileMenuBtn.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            // Đổi icon giữa ☰ và ✕
            this.textContent = mainNav.classList.contains('active') ? '✕' : '☰';
        });

        // Đóng menu khi click link (trên mobile)
        mainNav.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mainNav.classList.remove('active');
                mobileMenuBtn.textContent = '☰';
            });
        });
    }

    // Smooth scroll cho anchor links (nếu có)
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
