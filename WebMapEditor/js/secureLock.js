/**
 * FILE: secureLock.js
 * MỤC ĐÍCH: Quản lý chế độ Khóa bảo mật (Secure Lock Mode)
 * Cung cấp: lock/unlock editor, chặn tương tác khi đang khóa.
 */

const SecureLock = {
    isLocked: false,
    failedAttempts: 0,

    init() {
        console.log("🔐 SecureLock Initialized");
        const btnLock = document.getElementById('btnLockEditor');
        if (btnLock) {
            btnLock.onclick = () => this.lock();
        }

        // Shortcut Ctrl+L
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.lock();
            }
        });

        // Tự động khóa sau 30 phút idle (tùy chọn)
        this.setupIdleTimer(30 * 60 * 1000);
    },

    lock() {
        if (this.isLocked) return;
        
        console.log("🔒 Editor Locked");
        this.isLocked = true;
        document.getElementById('secureLockOverlay').classList.remove('hidden');
        document.getElementById('lockPasswordInput').value = '';
        document.getElementById('lockPasswordInput').focus();
        document.getElementById('lockError').classList.add('hidden');
        
        // Chặn scroll body
        document.body.style.overflow = 'hidden';
    },

    async unlock() {
        const password = document.getElementById('lockPasswordInput').value;
        if (!password) return;

        const btn = document.getElementById('btnUnlock');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-small"></span> Đang xác thực...';
        btn.disabled = true;

        try {
            // WHY: Phải xác thực mật khẩu qua Server để đảm bảo an toàn, không so sánh local.
            const response = await apiFetch('/auth/unlock-session', {
                method: 'POST',
                body: JSON.stringify({ password })
            });

            if (response.success) {
                console.log("🔓 Editor Unlocked");
                this.isLocked = false;
                this.failedAttempts = 0;
                document.getElementById('secureLockOverlay').classList.add('hidden');
                document.body.style.overflow = 'auto';
            } else {
                this.handleFail(response.message || "Mật khẩu không chính xác");
            }
        } catch (error) {
            this.handleFail("Lỗi kết nối Server");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    handleFail(msg) {
        this.failedAttempts++;
        const errEl = document.getElementById('lockError');
        errEl.innerText = msg;
        errEl.classList.remove('hidden');
        
        // Hiệu ứng rung modal khi sai
        const modal = document.querySelector('.lock-modal');
        modal.classList.add('shake');
        setTimeout(() => modal.classList.remove('shake'), 500);

        if (this.failedAttempts >= 10) {
            alert("Bạn đã nhập sai quá 10 lần. Hệ thống tự động đăng xuất để bảo mật.");
            handleLogout();
        }
    },

    setupIdleTimer(timeout) {
        let timer;
        const resetTimer = () => {
            clearTimeout(timer);
            if (!this.isLocked) {
                timer = setTimeout(() => this.lock(), timeout);
            }
        };
        window.onload = resetTimer;
        document.onmousemove = resetTimer;
        document.onkeydown = resetTimer;
    }
};

// Expose functions to HTML
window.unlockEditor = () => SecureLock.unlock();
window.handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/admin/login.html'; 
};

// Khởi chạy khi tải trang
document.addEventListener('DOMContentLoaded', () => SecureLock.init());
