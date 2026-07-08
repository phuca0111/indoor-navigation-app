// ============================================================
// AUTOSAVE.JS - Tự động lưu nháp vào LocalStorage
// ============================================================

const AUTOSAVE_INTERVAL = 30000; // 30 giây

function getCurrentFloor() {
    var floorSelect = document.getElementById('floorSelect');
    return floorSelect ? (floorSelect.value || '1') : '1';
}

// --- LẤY KHÓA LƯU TRỮ RIÊNG CHO TỪNG TÒA NHÀ ---
function getAutosaveKey() {
    if (window.EditorCore && EditorCore.ProjectManager) {
        var pmKey = EditorCore.ProjectManager.getAutosaveKey();
        if (pmKey) return pmKey;
    }
    var building = window.buildingId || 'default';
    var floor = getCurrentFloor();
    return 'floorplan_autosave_' + building + '_' + floor;
}

// --- KHỞI CHẠY TỰ ĐỘNG LƯU ---
function startAutoSave() {
    if (!window.buildingId) {
        console.warn('⚠️ Không tìm thấy buildingId, Auto-save sẽ dùng khóa mặc định.');
    }
    console.log('⏱️ Hệ thống Auto-save đã kích hoạt (30s). Key:', getAutosaveKey());

    setInterval(function () {
        try {
            var snapshot = getMapSnapshot();
            snapshot.autosaveAt = new Date().toISOString();
            snapshot.buildingId = window.buildingId || 'default';
            snapshot.floor = getCurrentFloor();
            localStorage.setItem(getAutosaveKey(), JSON.stringify(snapshot));

            // Cập nhật nhãn trạng thái
            var now = new Date();
            var timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                now.getMinutes().toString().padStart(2, '0') + ':' +
                now.getSeconds().toString().padStart(2, '0');

            var statusEl = document.getElementById('autosaveStatus');
            if (statusEl) {
                statusEl.textContent = 'Đã lưu nháp: ' + timeStr;
                statusEl.style.opacity = '1';
                setTimeout(() => { statusEl.style.opacity = '0.7'; }, 2000);
            }
        } catch (e) {
            console.error('Lỗi Auto-save:', e);
        }
    }, AUTOSAVE_INTERVAL);
}

// --- KIỂM TRA BẢN NHÁP CŨ ---
function checkAutoSave() {
    var savedData = localStorage.getItem(getAutosaveKey());
    if (savedData) {
        try {
            var data = JSON.parse(savedData);
            var mapName = data.mapName || 'không tên';
            var savedAt = data.autosaveAt
                ? new Date(data.autosaveAt).toLocaleString()
                : 'không rõ thời gian';

            // Hỏi người dùng có muốn khôi phục không
            var confirmRestore = confirm(
                '💾 Tìm thấy bản vẽ nháp của tòa nhà này ("' + mapName + '", tầng ' + getCurrentFloor() + ').\n' +
                'Lưu lúc: ' + savedAt + '\n\n' +
                'Bạn có muốn khôi phục không?'
            );

            if (confirmRestore) {
                applyMapSnapshot(data);
                console.log('✅ Đã khôi phục bản nháp của ' + (window.buildingId || 'default'));
            }
        } catch (e) {
            console.error('Lỗi đọc bản nháp:', e);
        }
    }
}

// --- XÓA BẢN NHÁP (khi Publish thành công hoặc Export) ---
function clearAutoSave() {
    localStorage.removeItem(getAutosaveKey());
}
