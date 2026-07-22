// ============================================================
// COMMAND-BAR-UI.JS — Thanh lệnh CAD (spec §4.3, §5.10)
// ============================================================
(function () {
    'use strict';

    var TOOL_LABELS_VI = {
        select: 'Chọn', wall: 'Tường', line: 'Đoạn thẳng', polygon: 'Đa giác',
        room: 'Phòng', circle: 'Tròn', door: 'Cửa', poi: 'Điểm POI', point: 'Điểm mốc',
        qr: 'Mốc QR', path: 'Đường đi', ruler: 'Dist',         area: 'Area', polyline: 'Tường',
        hatch: 'Hatch', hatchedit: 'Hatchedit', ellipse: 'Elip', arc: 'Cung', regpoly: 'Đa giác đều',
        ltscale: 'LTScale', region: 'Region', redraw: 'Redraw',
        block: 'Block', insert: 'Insert', attdef: 'ATTDef', attedit: 'ATTEdit',
        dimlinear: 'Dimlinear', dimaligned: 'Dimaligned', dimedit: 'DIMEdit', block: 'Block', insert: 'Insert',
        calibrate: 'Calibrate', 'bg-crop': 'Crop nền', 'bg-adjust': 'Chỉnh nền'
    };

    function toolLabel(toolId) {
        if (!toolId) return '';
        return TOOL_LABELS_VI[toolId] || toolId;
    }

    function initCommandBar() {
        if (!window.EditorCore || !EditorCore.toolCommand) return;

        var input = document.getElementById('commandInput');
        var hint = document.getElementById('commandHint');
        if (!input) return;

        var TCM = EditorCore.toolCommand;

        function setHint(text) {
            if (hint) hint.textContent = text || '';
        }

        function showResult(result) {
            if (!result) return;
            if (result.ok) {
                setHint('→ ' + toolLabel(result.toolId));
            } else if (result.error === 'UNKNOWN_COMMAND') {
                setHint('Không rõ lệnh: ' + (result.input || ''));
            } else if (result.error === 'NO_LAST_COMMAND') {
                setHint('Chưa có lệnh trước');
            }
        }

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var text = input.value.trim();
                if (!text) {
                    showResult(TCM.repeat());
                    return;
                }
                var result = TCM.execute(text, { source: 'command-bar' });
                showResult(result);
                if (result.ok) input.value = '';
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (input.value) {
                    input.value = '';
                    setHint('');
                    return;
                }
                TCM.cancel();
                setHint('Đã hủy');
                return;
            }
        });

        input.addEventListener('input', function () {
            var token = input.value.trim();
            if (!token) {
                setHint('');
                return;
            }
            var toolId = TCM.resolve(token);
            setHint(toolId ? '→ ' + toolLabel(toolId) : '');
        });

        window.focusCommandBar = function () {
            input.focus();
            input.select();
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCommandBar);
    } else {
        initCommandBar();
    }
})();
