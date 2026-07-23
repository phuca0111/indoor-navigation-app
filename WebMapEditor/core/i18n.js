(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root);
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.I18n = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    var KEY = 'webmapeditor.locale';
    var locale = 'vi';
    var dictionaries = {
        vi: {
            'menu.file': 'Tệp', 'file.new': 'Bản đồ mới', 'file.save': 'Lưu file (JSON)',
            'file.open': 'Mở file (JSON)', 'file.exportPdf': 'Xuất PDF…', 'file.importPdf': 'Nhập PDF',
            'file.exportDxf': 'Xuất DXF (CAD)', 'file.importDxf': 'Nhập DXF (CAD)',
            'file.exportSvg': 'Xuất SVG', 'file.importSvg': 'Nhập SVG',
            'theme.auto': 'Tự động', 'theme.light': 'Sáng', 'theme.dark': 'Tối',
            'status.ready': 'Sẵn sàng'
        },
        en: {
            'menu.file': 'File', 'file.new': 'New map', 'file.save': 'Save file (JSON)',
            'file.open': 'Open file (JSON)', 'file.exportPdf': 'Export PDF…', 'file.importPdf': 'Import PDF',
            'file.exportDxf': 'Export DXF (CAD)', 'file.importDxf': 'Import DXF (CAD)',
            'file.exportSvg': 'Export SVG', 'file.importSvg': 'Import SVG',
            'theme.auto': 'Auto', 'theme.light': 'Light', 'theme.dark': 'Dark',
            'status.ready': 'Ready'
        }
    };
    var phrases = [
        ['Đang xử lý...', 'Processing...'],
        ['Nâng cao', 'Advanced'],
        ['Constraint ngang', 'Horizontal constraint'],
        ['Constraint dọc', 'Vertical constraint'],
        ['Constraint khoảng cách', 'Distance constraint'],
        ['Cấu hình Dynamic Block', 'Configure Dynamic Block'],
        ['Gắn XRef JSON', 'Attach JSON XRef'],
        ['Cài manifest plugin', 'Install plugin manifest'],
        ['Gắn cảm biến Digital Twin', 'Bind Digital Twin sensor'],
        ['Xem trạng thái nâng cao', 'View advanced status'],
        ['Nháp', 'Draft'], ['Lịch sử', 'History'], ['Kiểm tra', 'Validate'],
        ['Lưu nháp', 'Save draft'], ['Xem trước', 'Preview'], ['Xuất bản', 'Publish'],
        ['Người dùng', 'User'], ['Đang chỉnh sửa', 'Editing'], ['vừa mở', 'just opened'],
        ['Về bảng điều khiển', 'Back to dashboard'], ['Tầng đang bị khóa', 'Floor is locked'],
        ['Cướp quyền sửa', 'Take over editing'], ['Lịch sử phiên bản', 'Version history'],
        ['Làm mới', 'Refresh'], ['Đóng', 'Close'],
        ['Chọn', 'Select'], ['Vẽ', 'Draw'], ['Sửa', 'Edit'], ['Ghi chú', 'Annotate'],
        ['Chèn', 'Insert'], ['Điều hướng', 'Navigation'], ['Xem', 'View'],
        ['Phòng', 'Room'], ['Tròn', 'Circle'], ['Cửa', 'Door'], ['Đa giác', 'Polygon'],
        ['Đều', 'Regular'], ['Tường', 'Wall'], ['Đoạn', 'Line'], ['Cung', 'Arc'],
        ['Elip', 'Ellipse'], ['Điểm', 'Point'], ['Tường dày', 'Multiline'],
        ['Sao chép', 'Copy'], ['Mảng', 'Array'], ['Cắt', 'Trim'], ['Kéo dài', 'Extend'],
        ['Bo góc', 'Fillet'], ['Vát góc', 'Chamfer'], ['Cắt điểm', 'Break'],
        ['Chia đều', 'Divide'], ['Sửa đa giác', 'Edit polyline'],
        ['Sao thuộc tính', 'Match properties'], ['Phá khối', 'Explode'],
        ['Song song', 'Parallel'], ['Nối', 'Join'], ['Di chuyển', 'Move'],
        ['Xoay', 'Rotate'], ['Tỷ lệ', 'Scale'], ['Đối xứng', 'Mirror'],
        ['Căn chỉnh', 'Align'], ['Nhóm', 'Group'], ['Rã nhóm', 'Ungroup'],
        ['KT thẳng', 'Linear dim'], ['KT nghiêng', 'Aligned dim'], ['Sửa KT', 'Edit dim'],
        ['Đo nối', 'Continue dim'], ['Đo góc', 'Angular dim'], ['Bán kính', 'Radius'],
        ['Đ.kính', 'Diameter'], ['Đo xa', 'Distance'], ['Diện tích', 'Area'],
        ['Vùng kín', 'Boundary'], ['Họa tiết', 'Hatch'], ['Sửa họa tiết', 'Edit hatch'],
        ['Khối', 'Block'], ['Chèn khối', 'Insert block'], ['Hiệu chỉnh', 'Calibrate'],
        ['Cắt nền', 'Crop background'], ['Thẳng nền', 'Deskew background'],
        ['Quét phòng', 'Detect rooms'], ['Đường đi', 'Path'], ['Điểm POI', 'POI'],
        ['Dự án', 'Project'], ['Lớp', 'Layers'], ['Cấu hình', 'Settings'],
        ['Thêm lớp', 'Add layer'], ['Bản đồ', 'Map'], ['Tầng:', 'Floor:'],
        ['Tỉ lệ ngang:', 'Horizontal scale:'], ['Tỉ lệ dọc:', 'Vertical scale:'],
        ['Tầng trệt', 'Ground floor'], ['Hiển thị', 'Display'], ['Hiện lưới', 'Show grid'],
        ['Hút lưới', 'Snap to grid'], ['Nhãn góc tia', 'Polar angle labels'],
        ['Hiện kích thước', 'Show dimensions'], ['Bắt điểm nâng cao (OSNAP)', 'Object Snap (OSNAP)'],
        ['Kiểu kích thước (Dim Style)', 'Dimension Style'], ['Cỡ chữ:', 'Text size:'],
        ['Mũi tên:', 'Arrow:'], ['Số lẻ (m):', 'Decimals (m):'], ['Ảnh nền', 'Background'],
        ['Độ mờ:', 'Opacity:'], ['Tương phản:', 'Contrast:'], ['Độ sáng:', 'Brightness:'],
        ['Áp bộ lọc vào ảnh', 'Apply filters to image'], ['Nền', 'Background'],
        ['Toàn màn hình bản vẽ', 'Fullscreen drawing'], ['Thu dải lệnh', 'Collapse ribbon'],
        ['Sẵn sàng', 'Ready'], ['Thuộc tính', 'Properties'], ['Đối tượng', 'Objects'],
        ['Chọn một đối tượng để chỉnh sửa', 'Select an object to edit'],
        ['Kiểm tra bản đồ', 'Validate map'], ['Nguồn:', 'Source:'],
        ['Chưa chạy kiểm tra.', 'Validation has not run.'], ['Chạy lại', 'Run again'],
        ['Xóa kết quả', 'Clear results'], ['Lỗi (chặn xuất bản)', 'Errors (block publishing)'],
        ['Cảnh báo', 'Warnings'], ['Lệnh', 'Command'], ['Chiều dài', 'Length'],
        ['Phiên đã khóa', 'Session locked'], ['Mật khẩu', 'Password'],
        ['Mở khóa', 'Unlock'], ['Đăng xuất', 'Sign out'], ['Đang sửa', 'Editing']
    ];
    function translatePhrase(value) {
        var text = String(value || '').trim();
        for (var i = 0; i < phrases.length; i++) {
            if (text === phrases[i][0] || text === phrases[i][1]) {
                return locale === 'en' ? phrases[i][1] : phrases[i][0];
            }
        }
        var floor = text.match(/^(Tầng|Floor)\s+(\d+)$/i);
        if (floor) return locale === 'en' ? 'Floor ' + floor[2] : 'Tầng ' + floor[2];
        return null;
    }
    function normalize(value) { return dictionaries[value] ? value : 'vi'; }
    function t(key, vars) {
        var value = dictionaries[locale][key] || dictionaries.vi[key] || key;
        return String(value).replace(/\{(\w+)\}/g, function (_, name) {
            return vars && vars[name] != null ? String(vars[name]) : _;
        });
    }
    function applyToDom(scope) {
        scope = scope || root.document;
        if (!scope || !scope.querySelectorAll) return 0;
        var nodes = scope.querySelectorAll('[data-i18n]');
        Array.prototype.forEach.call(nodes, function (node) {
            var value = t(node.getAttribute('data-i18n'));
            if (node.tagName === 'INPUT' && node.hasAttribute('placeholder')) node.placeholder = value;
            else node.textContent = value;
        });
        var all = scope.querySelectorAll('*');
        Array.prototype.forEach.call(all, function (node) {
            if (/^(SCRIPT|STYLE|CANVAS)$/i.test(node.tagName || '')) return;
            ['title', 'placeholder', 'aria-label'].forEach(function (attribute) {
                if (!node.hasAttribute || !node.hasAttribute(attribute)) return;
                var translated = translatePhrase(node.getAttribute(attribute));
                if (translated != null) node.setAttribute(attribute, translated);
            });
            Array.prototype.forEach.call(node.childNodes || [], function (child) {
                if (child.nodeType !== 3) return;
                var translated = translatePhrase(child.nodeValue);
                if (translated == null) return;
                var leading = (child.nodeValue.match(/^\s*/) || [''])[0];
                var trailing = (child.nodeValue.match(/\s*$/) || [''])[0];
                child.nodeValue = leading + translated + trailing;
            });
        });
        if (root.document && root.document.documentElement) root.document.documentElement.lang = locale;
        return nodes.length + all.length;
    }
    function setLocale(value, options) {
        locale = normalize(value);
        if (!options || options.persist !== false) {
            try { root.localStorage && root.localStorage.setItem(KEY, locale); } catch (_) {}
        }
        applyToDom();
        return locale;
    }
    function init() {
        var saved = 'vi';
        try { saved = root.localStorage && root.localStorage.getItem(KEY) || 'vi'; } catch (_) {}
        return setLocale(saved, { persist: false });
    }
    function register(value, messages) {
        if (!value || !messages) return false;
        dictionaries[value] = Object.assign({}, dictionaries[value] || {}, messages);
        return true;
    }
    return {
        init: init, t: t, setLocale: setLocale, applyToDom: applyToDom,
        getLocale: function () { return locale; }, register: register, normalizeLocale: normalize
    };
});
