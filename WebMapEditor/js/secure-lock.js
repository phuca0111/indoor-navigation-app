// Deprecated: logic khóa đã chuyển sang secure-session-pin.js
// Giữ file để tránh 404 nếu cache HTML cũ còn gọi secure-lock.js
(function () {
    if (window.beginEditorSecureLock) return;
    var s = document.createElement('script');
    s.src = 'js/secure-session-pin.js?v=20260810pin3';
    document.head.appendChild(s);
})();
