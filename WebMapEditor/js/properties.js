// ============================================================
// PROPERTIES.JS - Panel thuộc tính & Danh sách đối tượng
// ============================================================

const roomTypes = ['Văn phòng', 'Nhà vệ sinh', 'Thang máy', 'Cầu thang', 'Sảnh chờ', 'Phòng kỹ thuật', 'Phòng chức năng', 'Khác'];

function setDefaultWallThickness(px) {
    var v = Math.max(1, Math.min(80, Number(px) || 4));
    window.defaultWallThickness = v;
    if (window.EditorCore && EditorCore.ModifySession && EditorCore.ModifySession.setMlineThickness) {
        EditorCore.ModifySession.setMlineThickness(v);
    }
    if (typeof showToast === 'function') showToast('Độ dày tường: ' + v + 'px', 'success');
}
window.setDefaultWallThickness = setDefaultWallThickness;

function escapeHtmlValue(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// === CẬP NHẬT PANEL THUỘC TÍNH ===
function updatePropertiesPanel() {
    if (!propertiesDiv) return;

    // Không có gì được chọn -> Hiện hướng dẫn công cụ
    if (!selectedObject && !selectedRoom) {
        if (currentTool === 'path') {
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>💡 <b>Vẽ đường đi:</b></p>
                    <p>- Click vào <b>nút</b> để bắt đầu nối.</p>
                    <p>- Click tiếp nút khác để tạo đoạn đường.</p>
                    <p>- Click <b>chuột phải</b> để ngắt chuỗi.</p>
                </div>`;
        } else if (currentTool === 'wall') {
            var waitPts = (window.EditorCore && EditorCore.PolylineTool)
                ? EditorCore.PolylineTool.getPoints().length
                : 0;
            var th = window.defaultWallThickness || 4;
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>🧱 <b>Vẽ Tường (W):</b></p>
                    <p>- Click điểm đầu → click tiếp tạo đoạn (hút đỉnh/lưới).</p>
                    <p>- Tiếp tục click để nối chuỗi; mỗi đoạn là <b>tường</b>.</p>
                    <div class="prop-row"><label>Độ dày:</label>
                    <input type="number" id="wallThicknessInput" min="1" max="80" step="1" value="${th}"
                        onchange="setDefaultWallThickness(Number(this.value))"><span class="unit">px</span></div>
                    <p class="hint-text">Tăng độ dày = tường trông dày hơn (thay MLine đơn giản).</p>
                    <p>- <b>ESC</b> / <b>Enter</b> / nháy đúp: ngắt chuỗi.</p>
                    <p>- Điểm chờ: <b>${waitPts}</b></p>
                </div>`;
        } else if (currentTool === 'mline') {
            var mt = (window.EditorCore && EditorCore.ModifySession && EditorCore.ModifySession.getSnapshot)
                ? (EditorCore.ModifySession.getSnapshot().mlineThickness || 12)
                : 12;
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>🧱 <b>Tường dày (ML):</b></p>
                    <p>Vẽ tường <b>độ dày lớn</b> (một đối tượng tường — không tạo mép phụ).</p>
                    <p>Click chuỗi điểm → <b>Enter</b> / nháy đúp kết thúc.</p>
                    <p>Độ dày hiện tại: <b>${mt} px</b> (đổi ở panel tường sau khi chọn, hoặc W + Độ dày).</p>
                </div>`;
        } else if (currentTool === 'insert') {
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📦 <b>Insert (I):</b></p>' +
                '<p>Click trên map để chèn block đã chọn. <b>Esc</b> hủy.</p>' +
                '<p>Thư viện: <b>' + (typeof blocks !== 'undefined' ? blocks.length : 0) + '</b> block</p>' +
                '</div>';
        } else if (currentTool === 'dimlinear') {
            var step = (typeof dimlinearSession !== 'undefined' && dimlinearSession)
                ? dimlinearSession.step : 1;
            var stepHint = step === 1 ? 'Click điểm đo 1'
                : step === 2 ? 'Click điểm đo 2'
                : 'Click vị trí đường dim (ngang/dọc theo chuột)';
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📏 <b>Dimlinear (DLI):</b></p>' +
                '<p>Đo ngang hoặc dọc (tự chọn theo vị trí đặt dim).</p>' +
                '<p><b>Bước:</b> ' + stepHint + '</p>' +
                '<p><b>Esc</b> hủy phiên. Annotation — không sang Android.</p>' +
                '</div>';
        } else if (currentTool === 'dimaligned') {
            var stepA = (typeof dimalignedSession !== 'undefined' && dimalignedSession)
                ? dimalignedSession.step : 1;
            var stepHintA = stepA === 1 ? 'Click điểm đo 1'
                : stepA === 2 ? 'Click điểm đo 2'
                : 'Click vị trí đường dim (song song cạnh)';
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📐 <b>Dimaligned (DAL):</b></p>' +
                '<p>Đo <b>đúng chiều dài cạnh</b> (kể cả nghiêng) — khác DLI chỉ đo ngang/dọc.</p>' +
                '<p><b>Bước:</b> ' + stepHintA + '</p>' +
                '<p><b>Esc</b> hủy phiên. Annotation — không sang Android.</p>' +
                '</div>';
        } else if (currentTool === 'dimedit') {
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>✏️ <b>DIMEdit (DED):</b></p>' +
                '<p>Click / kéo <b>dim</b> để đổi vị trí đường đo.</p>' +
                '<p>Panel thuộc tính: sửa <b>nhãn</b> hoặc <b>Khôi phục đo</b>.</p>' +
                '<p>Cũng kéo được bằng tool <b>V</b> khi đã chọn dim.</p>' +
                '</div>';
        } else if (currentTool === 'trim' || currentTool === 'extend') {
            var isTrim = currentTool === 'trim';
            propertiesDiv.innerHTML = isTrim ? `
                <div class="tool-guide">
                    <p>✂️ <b>Cắt xén (TR) — đơn giản</b></p>
                    <p>Click <b>phần muốn bỏ</b> trên tường/đoạn.</p>
                    <p>· Có tường khác giao → cắt theo giao (như AutoCAD chọn all biên).</p>
                    <p>· Đoạn đứng một mình → <b>cắt đôi</b> tại chỗ click, bỏ nửa gần chuột.</p>
                    <p>Preview xanh = phần còn lại. Không cắt phòng/cửa.</p>
                </div>` : `
                <div class="tool-guide">
                    <p>↔️ <b>Kéo dài (EX)</b></p>
                    <p>B1: biên đích · B2: đoạn ngắn cần kéo tới biên.</p>
                </div>`;
        } else if (currentTool === 'move' || currentTool === 'copy' || currentTool === 'array') {
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p><b>${currentTool === 'move' ? 'Di chuyển chính xác (M)' : currentTool === 'copy' ? 'Sao chép (CO)' : 'Hàng loạt (AR)'}</b></p>
                    <p>${currentTool === 'move' ? 'Kéo thả thường ngày dùng <b>V</b>. M dùng khi cần snap gốc→đích.' : ''}</p>
                    <p>${currentTool === 'copy' ? '1 bản. Nhân nhiều đều → <b>Hàng loạt (AR)</b>.' : ''}</p>
                    <p>${currentTool === 'array' ? 'Copy lặp theo vector (hỏi số bản). Khác CO ở chỗ nhân nhiều lần đều khoảng.' : ''}</p>
                </div>`;
        } else if (currentTool === 'line') {
            var lineState = (window.EditorCore && EditorCore.LineTool)
                ? EditorCore.LineTool.getState()
                : 'idle';
            var lineStateVi = (lineState === 'drawing') ? 'đang vẽ' : 'chờ';
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>📏 <b>Vẽ Đoạn thẳng (L):</b></p>
                    <p>- Click điểm 1 → click điểm 2 (hoặc <b>gõ chiều dài</b>).</p>
                    <p>- Khi đang vẽ: nhãn <b>m</b> gần đầu chuột · ô <b>Chiều dài</b> dưới status bar.</p>
                    <p>- Gõ ví dụ <b>3.5m</b> rồi <b>Enter</b> = đặt đúng độ dài theo hướng chuột.</p>
                    <p>- Đoạn đã tạo: bật <b>Hiện kích thước</b> để thấy nhãn giữa cạnh.</p>
                    <p>- <b>ESC</b>: hủy. Trạng thái: <b>${lineStateVi}</b></p>
                </div>`;
        } else if (currentTool === 'polygon') {
            var polyMetrics = (typeof getPolygonMetrics === 'function' && polygonPoints.length >= 2)
                ? getPolygonMetrics(polygonPoints, {
                    previewPoint: window.lastMouseWorld || null,
                    includeClosingEdge: polygonPoints.length >= 2 && !!window.lastMouseWorld
                })
                : null;
            var edgeLines = '';
            if (polyMetrics && polyMetrics.edges.length) {
                edgeLines = '<p>Cạnh: ' + polyMetrics.edges.map(function (e, idx) {
                    return (idx + 1) + '=' + e.lengthM.toFixed(1) + 'm';
                }).join(' · ') + '</p>';
            }
            var statLine = '';
            if (polyMetrics) {
                var bits = [];
                if (polyMetrics.perimeterM > 0) bits.push('CV: ' + polyMetrics.perimeterM.toFixed(1) + 'm');
                if (polyMetrics.areaM2 > 0) bits.push('DT: ' + polyMetrics.areaM2.toFixed(1) + 'm²');
                if (bits.length) statLine = '<p><b>' + bits.join(' · ') + '</b></p>';
            }
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>🔺 <b>Vẽ Đa giác (G):</b></p>
                    <p>- Click từng đỉnh để tạo vùng kín (phòng đa giác).</p>
                    <p>- Cần tối thiểu <b>3 đỉnh</b>; nháy đúp hoặc đổi công cụ để kết thúc.</p>
                    <p>- <b>Ctrl+Z</b> khi đang vẽ: xóa đỉnh vừa đặt.</p>
                    <p>- Đỉnh hiện tại: <b>${polygonPoints.length}</b></p>
                    ${edgeLines}
                    ${statLine}
                </div>`;
        } else if (currentTool === 'ruler') {
            var distHtml = '';
            if (typeof lastDistMeasure !== 'undefined' && lastDistMeasure) {
                var m = lastDistMeasure;
                distHtml =
                    '<div class="prop-group">' +
                    '<div class="prop-group-title">Kết quả Dist</div>' +
                    '<div class="prop-row"><label>Khoảng cách:</label><span><b>' + m.distM.toFixed(2) + ' m</b></span></div>' +
                    '<div class="prop-row"><label>ΔX:</label><span>' + m.dxM.toFixed(2) + ' m</span></div>' +
                    '<div class="prop-row"><label>ΔY:</label><span>' + m.dyM.toFixed(2) + ' m</span></div>' +
                    '<div class="prop-row"><label>Góc:</label><span>' + m.angleDeg.toFixed(1) + '°</span></div>' +
                    '<p class="hint-text">Chỉ đo — <b>không</b> đổi tỷ lệ map. Căn tỷ lệ: ô <b>Tỷ lệ (m/ô)</b> bên trái.</p>' +
                    '</div>';
            }
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📏 <b>Dist (DI):</b></p>' +
                '<p>Click điểm 1 → kéo → thả điểm 2.</p>' +
                '<p>Hiện khoảng cách, ΔX, ΔY, góc theo tỷ lệ hiện tại.</p>' +
                '<p>Phím tắt: <b>DI</b> / <b>S</b> · <b>Esc</b> xóa kết quả.</p>' +
                '</div>' + distHtml;
        } else if (currentTool === 'area') {
            var areaHtml = '';
            if (typeof lastAreaMeasure !== 'undefined' && lastAreaMeasure) {
                var am = lastAreaMeasure;
                areaHtml =
                    '<div class="prop-group">' +
                    '<div class="prop-group-title">Kết quả Area</div>' +
                    '<div class="prop-row"><label>Diện tích:</label><span><b>' + am.areaM2.toFixed(2) + ' m²</b></span></div>' +
                    '<div class="prop-row"><label>Chu vi:</label><span>' + am.perimeterM.toFixed(2) + ' m</span></div>' +
                    '<p class="hint-text">Chỉ đo — <b>không</b> tạo phòng (khác Đa giác G) · không đổi tỷ lệ.</p>' +
                    '</div>';
            }
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📐 <b>Area (AA):</b></p>' +
                '<p>Click vào <b>phòng có sẵn</b> để xem diện tích (m²) + chu vi.</p>' +
                '<p>Không vẽ đỉnh — muốn tạo phòng dùng tool <b>Đa giác (G)</b>.</p>' +
                '<p>Phím tắt: <b>AA</b> · <b>Esc</b> xóa kết quả.</p>' +
                '</div>' + areaHtml;
        } else if (currentTool === 'hatch') {
            var st = window.hatchToolStyle || {
                pattern: 'lines', color: '#64748b', spacing: 12, angle: 45, useRoomTypeDefault: true
            };
            var hatchOpts = ['none', 'solid', 'lines', 'cross', 'dots'].map(function (p) {
                return '<option value="' + p + '"' + (st.pattern === p ? ' selected' : '') + '>' + p + '</option>';
            }).join('');
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>▤ <b>Hatch (H):</b></p>' +
                '<p>Click vào <b>phòng</b> để tô pattern phân loại (lưu trên phòng).</p>' +
                '<p>Khác Area: Area chỉ đo · Hatch đổi kiểu tô.</p>' +
                '</div>' +
                '<div class="prop-group">' +
                '<div class="prop-group-title">Kiểu tô</div>' +
                '<div class="prop-row"><label>Theo loại phòng:</label>' +
                '<input type="checkbox" ' + (st.useRoomTypeDefault ? 'checked' : '') +
                ' onchange="setHatchToolStyleProp(\'useRoomTypeDefault\', this.checked)"></div>' +
                '<div class="prop-row"><label>Pattern:</label>' +
                '<select onchange="setHatchToolStyleProp(\'pattern\', this.value)" ' +
                (st.useRoomTypeDefault ? 'disabled' : '') + '>' + hatchOpts + '</select></div>' +
                '<div class="prop-row"><label>Màu:</label>' +
                '<input type="color" value="' + (st.color || '#64748b') + '" ' +
                (st.useRoomTypeDefault ? 'disabled' : '') +
                ' onchange="setHatchToolStyleProp(\'color\', this.value)"></div>' +
                '<div class="prop-row"><label>Khoảng:</label>' +
                '<input type="number" min="4" max="48" value="' + (st.spacing || 12) + '" ' +
                (st.useRoomTypeDefault ? 'disabled' : '') +
                ' onchange="setHatchToolStyleProp(\'spacing\', Number(this.value))">' +
                '<span class="unit">px</span></div>' +
                '<div class="prop-row"><label>Góc:</label>' +
                '<input type="number" min="0" max="179" value="' + (st.angle != null ? st.angle : 45) + '" ' +
                (st.useRoomTypeDefault ? 'disabled' : '') +
                ' onchange="setHatchToolStyleProp(\'angle\', Number(this.value))">' +
                '<span class="unit">°</span></div>' +
                '<button class="btn btn-sm btn-outline" type="button" onclick="clearHatchFromSelectedRoom()">Xóa hatch phòng đang chọn</button>' +
                '<p class="hint-text">Bật «Theo loại phòng» = pattern mặc định theo Loại (WC / thang / VP…).</p>' +
                '</div>';
        } else if (currentTool === 'calibrate') {
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📐 <b>Calibrate (CAL):</b></p>' +
                '<p>Click <b>điểm 1</b> → <b>điểm 2</b> trên cạnh đã biết chiều dài thật.</p>' +
                '<p>Nhập khoảng cách (m) → <b>Áp dụng tỷ lệ</b> → cập nhật <code>metersPerGrid</code>.</p>' +
                '<p>Khác Dist (DI): Dist chỉ đo, Calibrate <b>đổi tỷ lệ map</b>.</p>' +
                '<p><b>Esc</b> hủy phiên.</p>' +
                '</div>' +
                '<div class="prop-group">' +
                '<div class="prop-group-title">Khoảng cách thật</div>' +
                '<div class="prop-row"><label>Mét:</label>' +
                '<input type="number" id="calibrateMetersInput" min="0.01" step="0.01" value="1" style="width:80px;">' +
                '<span class="unit">m</span></div>' +
                '<button class="btn btn-sm btn-primary" type="button" onclick="applyCalibrateFromPanel()">Áp dụng tỷ lệ</button>' +
                '<p class="hint-text">Tỷ lệ hiện tại: <b>' +
                (typeof metersPerGrid !== 'undefined' ? Number(metersPerGrid).toFixed(4) : '—') +
                '</b> m/ô</p>' +
                '</div>';
        } else if (currentTool === 'bg-crop') {
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>✂️ <b>Crop ảnh nền (CROP):</b></p>' +
                '<p>Kéo khung trên vùng giữ lại → <b>Enter</b> hoặc nút Áp dụng.</p>' +
                '<p>Sau crop: ảnh nền reset vị trí/xoay về gốc (scale=1).</p>' +
                '<p><b>Esc</b> hủy khung.</p>' +
                '</div>' +
                '<div class="prop-group">' +
                '<button class="btn btn-sm btn-primary" type="button" onclick="applyCropBackground()">Áp dụng crop</button>' +
                '</div>';
        } else if (currentTool === 'bg-warp') {
            propertiesDiv.innerHTML =
                '<div class="tool-guide">' +
                '<p>📐 <b>Nắn phối cảnh (4 điểm):</b></p>' +
                '<p>Click lần lượt 4 góc của vùng cần nắn theo thứ tự <b>TL → TR → BR → BL</b> ' +
                '(trên-trái, trên-phải, dưới-phải, dưới-trái).</p>' +
                '<p>Đủ 4 điểm → <b>Enter</b> hoặc nút Áp dụng. Vùng chọn sẽ được kéo về chữ nhật thẳng.</p>' +
                '<p><b>Esc</b> để hủy. Đã chọn: <b>' +
                ((typeof warpPointCount === 'function' ? warpPointCount() : 0)) + '/4</b> điểm.</p>' +
                '</div>' +
                '<div class="prop-group">' +
                '<button class="btn btn-sm btn-primary" type="button" onclick="applyPerspectiveDeskew()">Áp dụng nắn</button>' +
                '</div>';
        } else {
            var bgHtml = '';
            if (window.bgImage) {
                bgHtml = `
                <div class="prop-group">
                    <div class="prop-group-title">🖼️ Cài đặt Ảnh nền</div>
                    <div class="prop-row">
                        <label>Hiệu chỉnh:</label>
                        <button class="btn btn-sm ${currentTool === 'bg-adjust' ? 'btn-primary' : 'btn-outline'}" 
                                onclick="selectTool(currentTool === 'bg-adjust' ? 'select' : 'bg-adjust')">
                            ${currentTool === 'bg-adjust' ? '📍 Đang chỉnh' : '🖱️ Bật kéo thả'}
                        </button>
                    </div>
                    <div class="prop-row">
                        <label>Vị trí X:</label>
                        <input type="number" value="${Math.round(window.bgX)}" oninput="updateBgProp('bgX', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Vị trí Y:</label>
                        <input type="number" value="${Math.round(window.bgY)}" oninput="updateBgProp('bgY', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Tỉ lệ:</label>
                        <input type="number" step="0.01" value="${window.bgScale.toFixed(2)}" oninput="updateBgProp('bgScale', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Xoay:</label>
                        <div style="flex:1; display:flex; align-items:center; gap:8px;">
                            <input type="range" min="0" max="360" value="${window.bgRotation || 0}" 
                                   oninput="this.nextElementSibling.value = this.value; updateBgProp('bgRotation', Number(this.value))" 
                                   style="flex:1;">
                            <input type="number" value="${window.bgRotation || 0}" 
                                   oninput="this.previousElementSibling.value = this.value; updateBgProp('bgRotation', Number(this.value))" 
                                   style="width:50px;">
                            <span class="unit">°</span>
                        </div>
                    </div>
                    <div class="prop-row">
                        <label>Độ mờ:</label>
                        <input type="range" min="0" max="1" step="0.1" value="${window.bgOpacity}" oninput="updateBgProp('bgOpacity', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Deskew:</label>
                        <button class="btn btn-sm btn-outline" type="button" onclick="autoDeskewBackground()">Tự thẳng góc</button>
                        <button class="btn btn-sm ${currentTool === 'bg-warp' ? 'btn-primary' : 'btn-outline'}" type="button" onclick="selectTool(currentTool === 'bg-warp' ? 'select' : 'bg-warp')" title="Nắn phối cảnh bằng 4 điểm góc">📐 Nắn phối cảnh</button>
                    </div>
                    <div class="prop-row">
                        <label>Detect:</label>
                        <button class="btn btn-sm btn-outline" type="button" onclick="runAutoDetectV2()">Detect v2</button>
                    </div>
                    <p class="hint-text">💡 Bật "Kéo thả" để di chuyển ảnh. Contrast/Brightness: panel trái Cấu hình.</p>
                </div>`;
            }
            propertiesDiv.innerHTML = bgHtml + '<p class="hint-text">Chọn một đối tượng để xem thuộc tính hoặc chọn công cụ để bắt đầu vẽ</p>';
        }
        return;
    }

    // Xác định loại đối tượng
    var obj = selectedObject;
    if (!obj && selectedRoom) {
        obj = { type: 'room', data: selectedRoom };
    }

    if (obj.type === 'room') showRoomProps(obj.data);
    else if (obj.type === 'door') showDoorProps(obj.data);
    else if (obj.type === 'wall') showWallProps(obj.data);
    else if (obj.type === 'line') showLineProps(obj.data);
    else if (obj.type === 'poi') showPoiProps(obj.data);
    else if (obj.type === 'point') showCadPointProps(obj.data);
    else if (obj.type === 'qr') showQrProps(obj.data);
    else if (obj.type === 'node') showNodeProps(obj.data);
    else if (obj.type === 'blockRef') {
        propertiesDiv.innerHTML =
            (typeof renderBlockRefPropertiesHtml === 'function' ? renderBlockRefPropertiesHtml(obj.data) : '') +
            '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa Insert</button>';
    } else if (obj.type === 'dimension') {
        propertiesDiv.innerHTML =
            (typeof renderDimensionPropertiesHtml === 'function' ? renderDimensionPropertiesHtml(obj.data) : '') +
            '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa Dim</button>';
    }
}

/**
 * HTML nhóm "Nét vẽ": kiểu nét (Linetype) + độ dày (LWeight).
 * @param {'line'|'wall'} kind
 * @param {object} obj
 * @param {boolean} withWeight có hiện ô độ dày không (line có, wall dùng độ dày = thickness nên bỏ)
 */
function renderStrokeStyleHtml(kind, obj, withWeight) {
    var styles = (typeof LINE_STYLES !== 'undefined') ? LINE_STYLES : ['solid', 'dashed', 'dotted', 'dashdot'];
    var labels = (typeof LINE_STYLE_LABELS !== 'undefined') ? LINE_STYLE_LABELS : {};
    var cur = (typeof normalizeLineStyle === 'function') ? normalizeLineStyle(obj.lineStyle) : (obj.lineStyle || 'solid');
    var opts = styles.map(function (s) {
        return '<option value="' + s + '"' + (s === cur ? ' selected' : '') + '>' + (labels[s] || s) + '</option>';
    }).join('');
    var html =
        '<div class="prop-group">' +
        '<div class="prop-group-title">Nét vẽ</div>' +
        '<div class="prop-row"><label>Kiểu nét:</label>' +
        '<select onchange="updateStrokeProp(\'lineStyle\', this.value)">' + opts + '</select></div>';
    if (withWeight) {
        var w = (typeof clampLineWeight === 'function') ? clampLineWeight(obj.lineWeight) : (obj.lineWeight || 2);
        html +=
            '<div class="prop-row"><label>Độ dày:</label>' +
            '<input type="number" step="0.5" min="0.5" max="20" value="' + w + '" ' +
            'onchange="updateStrokeProp(\'lineWeight\', Number(this.value))"><span class="unit">px</span></div>';
    }
    html += '</div>';
    return html;
}

/** Cập nhật thuộc tính nét vẽ (lineStyle/lineWeight) cho line/wall đang chọn. */
function updateStrokeProp(prop, value) {
    if (!selectedObject) return;
    if (selectedObject.type !== 'line' && selectedObject.type !== 'wall') return;
    saveState();
    if (prop === 'lineStyle') {
        value = (typeof normalizeLineStyle === 'function') ? normalizeLineStyle(value) : value;
    } else if (prop === 'lineWeight') {
        value = (typeof clampLineWeight === 'function') ? clampLineWeight(value) : value;
    }
    selectedObject.data[prop] = value;
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    draw();
}
window.renderStrokeStyleHtml = renderStrokeStyleHtml;
window.updateStrokeProp = updateStrokeProp;

/** Thông tin cung tính trực tiếp từ hình học (fit qua đầu/giữa/cuối) — luôn đúng sau khi biến đổi. */
function getArcInfoLive(ln) {
    if (!ln || !ln.points || ln.points.length < 3) return null;
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!ge || !ge.arcFrom3Points) return null;
    var pts = ln.points;
    var a = pts[0];
    var mid = pts[Math.floor(pts.length / 2)];
    var b = pts[pts.length - 1];
    var arc = ge.arcFrom3Points(a, mid, b);
    if (!arc) return null;
    // Chiều dài cung ≈ tổng các đoạn polyline
    var lenPx = 0;
    for (var i = 1; i < pts.length; i++) lenPx += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { cx: arc.cx, cy: arc.cy, radius: arc.radius, lengthPx: lenPx };
}

// --- CUNG TRÒN (arc) — panel riêng ---
function showArcProps(ln) {
    var desc = getInspectorDescriptor();
    var info = getArcInfoLive(ln);
    var toM = (typeof pixelsToMeters === 'function') ? pixelsToMeters : function (v) { return v; };
    var rVal = info ? toM(info.radius).toFixed(2) : '—';
    var lenVal = info ? toM(info.lengthPx).toFixed(2) : '—';
    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '◠ Cung tròn #' + ln.id }) +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Bán kính:</label><span>' + rVal + '</span><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Độ dài cung:</label><span>' + lenVal + '</span><span class="unit">m</span></div>' +
        '<p class="hint-text">Cung dựng qua 3 điểm. Dùng Move/Rotate/Scale hoặc Align để biến đổi; vẽ lại (A) nếu cần đổi hình.</p>' +
        '</div>' +
        renderStrokeStyleHtml('line', ln, true) +
        renderQuickTransformHtml('line') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

/** Thông tin elip tính từ meta (rx/ry đo bằng pixel) → trục & chu vi xấp xỉ. */
function getEllipseInfoLive(ln) {
    if (!ln || !ln.ellipse) return null;
    var rx = ln.ellipse.rx || 0, ry = ln.ellipse.ry || 0;
    // Chu vi xấp xỉ Ramanujan
    var h = Math.pow(rx - ry, 2) / Math.pow(rx + ry || 1, 2);
    var peri = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return { rx: rx, ry: ry, peri: peri };
}

// --- ELIP (ellipse) — panel riêng ---
function showEllipseProps(ln) {
    var desc = getInspectorDescriptor();
    var info = getEllipseInfoLive(ln);
    var toM = (typeof pixelsToMeters === 'function') ? pixelsToMeters : function (v) { return v; };
    var majVal = info ? toM(info.rx * 2).toFixed(2) : '—';
    var minVal = info ? toM(info.ry * 2).toFixed(2) : '—';
    var periVal = info ? toM(info.peri).toFixed(2) : '—';
    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '⬭ Elip #' + ln.id }) +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Trục lớn:</label><span>' + majVal + '</span><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Trục nhỏ:</label><span>' + minVal + '</span><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Chu vi:</label><span>' + periVal + '</span><span class="unit">m</span></div>' +
        '<p class="hint-text">Elip dựng theo tâm + 2 trục. Dùng Move/Rotate/Scale hoặc Align để biến đổi; vẽ lại (EL) nếu cần đổi hình.</p>' +
        '</div>' +
        renderStrokeStyleHtml('line', ln, true) +
        renderQuickTransformHtml('line') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- ĐOẠN THẲNG (hỗ trợ) — schema-driven ---
function showLineProps(ln) {
    if (ln && ln.type === 'arc') return showArcProps(ln);
    if (ln && ln.type === 'ellipse') return showEllipseProps(ln);
    var desc = getInspectorDescriptor();
    var heading = typeof getPolylineHeadingDeg === 'function' ? getPolylineHeadingDeg(ln) : 0;
    var lenVal = '0';
    if (ln.points && ln.points.length >= 2 && typeof pixelsToMeters === 'function') {
        var a0 = ln.points[0], b0 = ln.points[1];
        var px0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
        lenVal = pixelsToMeters(px0).toFixed(2);
    }
    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '📏 Đoạn thẳng #' + ln.id }) +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Chiều dài:</label>' +
        '<input type="number" step="0.01" min="0.01" value="' + lenVal + '" ' +
        'onchange="updateLineLength(Number(this.value))"><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Hướng:</label><span>' + heading.toFixed(1) + '°</span></div>' +
        '<p class="hint-text">Nhập mét rồi Enter/blur — giữ hướng, kéo đầu còn lại. Giống tường.</p>' +
        '</div>' +
        renderStrokeStyleHtml('line', ln, true) +
        renderEndpointTrimHtml() +
        renderQuickTransformHtml('line') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

/** Đặt chiều dài đoạn (mét), giữ điểm đầu cố định, kéo điểm cuối theo hướng hiện tại. */
function updateLineLength(newLenMeters) {
    if (!selectedObject || selectedObject.type !== 'line') return;
    var ln = selectedObject.data;
    if (!ln.points || ln.points.length < 2) return;
    if (!(newLenMeters > 0) || !Number.isFinite(newLenMeters)) return;

    var newLenPx = typeof metersToPixels === 'function' ? metersToPixels(newLenMeters) : newLenMeters;
    if (!(newLenPx >= 4)) {
        if (typeof showToast === 'function') showToast('Chiều dài quá ngắn', 'error');
        return;
    }

    saveState();
    var p1 = ln.points[0];
    var p2 = ln.points[ln.points.length - 1];
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var currentLenPx = Math.sqrt(dx * dx + dy * dy);

    if (currentLenPx < 1e-6) {
        ln.points[ln.points.length - 1].x = p1.x + newLenPx;
        ln.points[ln.points.length - 1].y = p1.y;
    } else {
        var ratio = newLenPx / currentLenPx;
        ln.points[ln.points.length - 1].x = p1.x + dx * ratio;
        ln.points[ln.points.length - 1].y = p1.y + dy * ratio;
    }

    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('line', ln);
    }
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    updatePropertiesPanel();
    updateObjectList();
    draw();
}
window.updateLineLength = updateLineLength;

function updateLineProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'line') return;
    saveState();
    selectedObject.data[prop] = value;
    draw();
}

// --- TƯỜNG — schema + phần mở rộng legacy ---
function showWallProps(w) {
    var desc = getInspectorDescriptor();
    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '🧱 Tường #' + w.id }) +
        '<div class="prop-group">' +
        '<div class="prop-row"><label>Số điểm:</label><div class="prop-val">' + ((w.points || []).length) + '</div></div>' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Chiều dài:</label>' +
        '<input type="number" step="0.01" value="' + calcWallLength(w) + '" onchange="updateWallLength(Number(this.value))"><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Độ dày:</label>' +
        '<input type="number" step="1" min="1" value="' + (w.thickness || 4) + '" onchange="updateObjProp(\'thickness\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        renderStrokeStyleHtml('wall', w, false) +
        '<div class="prop-group">' +
        '<div class="prop-group-title">🔗 Nối tiếp tới Tường khác</div>' +
        '<div class="prop-row">' +
        '<label>Tới ID:</label>' +
        '<div style="display:flex;gap:4px;flex:1;">' +
        '<input type="number" id="manualWallTarget" placeholder="Mã..." style="width:50px;flex:1;">' +
        '<button class="btn btn-sm btn-primary" onclick="addManualWallEdge(' + w.id + ')">+ Nối</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<p class="hint-text">Kéo ô vuông đỉnh / chấm xoay trên map · hoặc panel bên dưới · lệnh <b>PE</b>: kéo đỉnh · <b>Ctrl+click</b> trên cạnh = thêm đỉnh.</p>' +
        renderEndpointTrimHtml() +
        renderQuickTransformHtml('wall') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// Hàm nối tường thủ công qua ID
function addManualWallEdge(fromId) {
    var targetInput = document.getElementById('manualWallTarget');
    var targetId = parseInt(targetInput.value);

    if (isNaN(targetId)) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập ID tường hợp lệ', 'error');
        return;
    }

    if (fromId === targetId) {
        if (typeof showToast === 'function') showToast('Không thể nối tới chính nó', 'error');
        return;
    }

    // Tìm 2 đối tượng tường
    var wallA = walls.find(function (w) { return w.id === fromId; });
    var wallB = walls.find(function (w) { return w.id === targetId; });

    if (wallA && wallB) {
        saveState();
        // Lấy điểm cuối của tường A và điểm đầu của tường B
        var pointA = wallA.points[wallA.points.length - 1];
        var pointB = wallB.points[0];

        // Tạo đoạn tường mới nối 2 điểm này
        createWallSegment(pointA, pointB, { thickness: wallA.thickness, is_outer: wallA.is_outer });

        updatePropertiesPanel();
        updateObjectList();
        draw();
        if (typeof showToast === 'function') showToast('Đã nối Tường #' + fromId + ' ➜ #' + targetId, 'success');
    } else {
        if (typeof showToast === 'function') showToast('Không tìm thấy Tường #' + targetId, 'error');
    }
}

// Tính chiều dài tường (mét)
function calcWallLength(w) {
    if (!w || !w.points || w.points.length < 2) return 0;
    var p1 = w.points[0];
    var p2 = w.points[w.points.length - 1];
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var distPx = Math.sqrt(dx * dx + dy * dy);
    return pixelsToMeters(distPx).toFixed(2);
}

// Cập nhật chiều dài tường
function updateWallLength(newLenMeters) {
    if (!selectedObject || selectedObject.type !== 'wall') return;
    var w = selectedObject.data;
    if (!w.points || w.points.length < 2) return;

    var newLenPx = metersToPixels(newLenMeters);
    if (newLenPx < 1) return;

    saveState();
    var p1 = w.points[0];
    var p2 = w.points[w.points.length - 1];

    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var currentLenPx = Math.sqrt(dx * dx + dy * dy);

    if (currentLenPx === 0) {
        w.points[w.points.length - 1].x = p1.x + newLenPx;
    } else {
        var ratio = newLenPx / currentLenPx;
        w.points[w.points.length - 1].x = p1.x + dx * ratio;
        w.points[w.points.length - 1].y = p1.y + dy * ratio;
    }

    draw();
}

function updateWallProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'wall') return;
    saveState();
    selectedObject.data[prop] = value;
    draw();
}

// --- PHÒNG — schema + kích thước computed ---
function showRoomProps(r) {
    applyDefaultRoomLabelStyle(r);
    var desc = getInspectorDescriptor();
    var safeName = escapeHtmlValue(r.name);

    var sizeHtml = '';
    if (r.shape === 'polygon' && r.points && typeof getPolygonMetrics === 'function') {
        var pm = getPolygonMetrics(r.points, { includeClosingEdge: true });
        var minEdgeM = typeof getMinPolygonEdgeMeters === 'function' ? getMinPolygonEdgeMeters() : 0.0011;
        var minEdgeLabel = typeof formatMinPolygonEdgeLabel === 'function'
            ? formatMinPolygonEdgeLabel()
            : '1.1mm';
        var geomWarn = '';
        if (typeof validatePolygonGeometry === 'function') {
            var gv = validatePolygonGeometry(r.points);
            if (!gv.ok) {
                geomWarn = '<div class="prop-hint" style="font-size:11px;color:#b91c1c;margin:0 0 6px;line-height:1.35">' +
                    '⚠ ' + escapeHtmlValue(gv.reason) + ' — sửa cạnh hoặc kéo đỉnh.</div>';
            }
        }
        var edgeList = pm.edges.map(function (e, idx) {
            return '<div class="prop-row"><label>Cạnh ' + (idx + 1) + ':</label>' +
                '<input type="number" step="0.001" min="' + minEdgeM + '" value="' + e.lengthM.toFixed(3) + '" ' +
                'onchange="updatePolygonEdgeLength(' + idx + ', parseFloat(this.value))" ' +
                'onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
                '<span class="unit">m</span></div>';
        }).join('');
        sizeHtml =
            '<div class="prop-group">' +
            '<div class="prop-group-title">Kích thước đa giác</div>' +
            geomWarn +
            '<div class="prop-hint" style="font-size:11px;color:#64748b;margin:0 0 6px;line-height:1.35">' +
            'Sửa cạnh → kéo đỉnh kế tiếp theo hướng cạnh. Tối thiểu ' + minEdgeLabel + '/cạnh.</div>' +
            edgeList +
            '<div class="prop-row"><label>Chu vi:</label>' +
            '<input type="text" value="' + pm.perimeterM.toFixed(1) + '" disabled><span class="unit">m</span></div>' +
            '<div class="prop-row"><label>Diện tích:</label>' +
            '<input type="text" value="' + pm.areaM2.toFixed(1) + '" disabled><span class="unit">m²</span></div>' +
            '<div class="prop-row"><label>Số đỉnh:</label><div class="prop-val">' + r.points.length + '</div></div>' +
            '</div>';
    } else {
        var wm = pixelsToMeters(r.width).toFixed(1);
        var hm = pixelsToMeters(r.height).toFixed(1);
        var area = (pixelsToMeters(r.width) * pixelsToMeters(r.height)).toFixed(1);
        sizeHtml =
            '<div class="prop-group">' +
            '<div class="prop-group-title">Kích thước</div>' +
            '<div class="prop-row"><label>Ngang:</label>' +
            '<input type="number" value="' + wm + '" step="0.1" onchange="updateRoomProp(\'width\', metersToPixels(Number(this.value)))"><span class="unit">m</span></div>' +
            '<div class="prop-row"><label>Dọc:</label>' +
            '<input type="number" value="' + hm + '" step="0.1" onchange="updateRoomProp(\'height\', metersToPixels(Number(this.value)))"><span class="unit">m</span></div>' +
            '<div class="prop-row"><label>S:</label><input type="text" value="' + area + '" disabled><span class="unit">m²</span></div>' +
            '</div>';
    }

    // Schema: type/color/x/y/label* — giữ textarea tên (nhiều dòng) + bỏ shape (read-only qua metrics)
    var schemaHtml = typeof renderSchemaPropGroup === 'function'
        ? renderSchemaPropGroup(desc, {
            title: 'Phòng #' + r.id,
            skipKeys: ['name', 'shape']
        })
        : '';

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">Tên phòng</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<textarea id="roomNameInput" rows="3" style="resize:vertical;min-height:56px;width:100%;" oninput="updateRoomProp(\'name\', this.value)">' + safeName + '</textarea>' +
        '<button class="btn btn-sm btn-primary" style="align-self:flex-end;padding:2px 10px;" onclick="updatePropertiesPanel()">Lưu tên</button></div></div>' +
        '<p class="hint-text">Hình dạng: <b>' + escapeHtmlValue(r.shape || 'rect') + '</b> · Enter để xuống dòng trong tên.</p>' +
        '</div>' +
        schemaHtml +
        sizeHtml +
        renderQuickTransformHtml('room') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

/** Cắt đuôi thừa về giao tường/đoạn gần nhất */
function renderEndpointTrimHtml() {
    return '<div class="prop-group">' +
        '<div class="prop-group-title">Cắt đuôi thừa</div>' +
        '<p class="hint-text">Đưa đỉnh đầu/cuối về <b>giao</b> với tường hoặc đoạn khác (thay kéo tay / lệnh TR).</p>' +
        '<div class="prop-row" style="gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="retractSelectedEndpoint(\'start\')">Cắt đỉnh đầu</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="retractSelectedEndpoint(\'end\')">Cắt đỉnh cuối</button>' +
        '</div></div>';
}

function retractSelectedEndpoint(which) {
    var t = getQuickTransformTarget();
    if (!t || (t.type !== 'line' && t.type !== 'wall')) {
        if (typeof showToast === 'function') showToast('Chọn đoạn hoặc tường trước', 'error');
        return;
    }
    if (typeof retractPolylineEndpointToNearestCutter !== 'function') {
        if (typeof showToast === 'function') showToast('Thiếu hàm cắt đuôi', 'error');
        return;
    }
    if (typeof saveState === 'function') saveState();
    var ok = retractPolylineEndpointToNearestCutter(t.type, t.data, which);
    if (ok) {
        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        updatePropertiesPanel();
        updateObjectList();
        draw();
        if (typeof showToast === 'function') {
            showToast(which === 'start' ? 'Đã cắt đỉnh đầu về giao' : 'Đã cắt đỉnh cuối về giao', 'success');
        }
    } else if (typeof showToast === 'function') {
        showToast('Không tìm thấy giao với tường/đoạn khác trên cạnh đuôi', 'error');
    }
}
window.retractSelectedEndpoint = retractSelectedEndpoint;

/** Panel biến đổi nhanh — xoay đến góc / tỷ lệ chuẩn kỹ thuật */
function renderQuickTransformHtml(kind) {
    var angleNow = (typeof getSelectionRotationDeg === 'function') ? getSelectionRotationDeg() : null;
    var angleVal = angleNow != null ? angleNow.toFixed(1) : '0';
    var angleLabel = angleNow != null
        ? ('Góc hiện tại: <b>' + angleNow.toFixed(1) + '°</b>')
        : 'Góc: —';
    return '<div class="prop-group">' +
        '<div class="prop-group-title">Biến đổi nhanh</div>' +
        '<p class="hint-text" id="qtAngleLabel">' + angleLabel + '</p>' +
        '<div class="prop-row" style="gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="toggleRoomAngleLabels()">' +
        (window.showRoomAngleLabels ? 'Ẩn góc trên map' : 'Hiện góc trên map') + '</button></div>' +

        '<div class="prop-group-title" style="margin-top:8px">Xoay đến góc</div>' +
        '<p class="hint-text">Phòng / đoạn / tường: kéo chấm xoay trên map, hoặc nhập góc tuyệt đối bên dưới.</p>' +
        '<div class="prop-row"><label>Đến:</label>' +
        '<input type="number" id="qtRotateToDeg" value="' + angleVal + '" min="0" max="360" step="1" style="width:72px">' +
        '<span class="unit">°</span>' +
        '<button class="btn btn-sm btn-primary" type="button" onclick="applySelectionRotateToDegrees(Number(document.getElementById(\'qtRotateToDeg\').value))">Xoay đến</button></div>' +
        '<div class="prop-row" style="gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateToDegrees(0)">0°</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateToDegrees(45)">45°</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateToDegrees(90)">90°</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateToDegrees(180)">180°</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateToDegrees(270)">270°</button></div>' +
        '<div class="prop-row"><label>Xoay thêm:</label>' +
        '<input type="number" id="qtRotateDeg" value="15" step="1" style="width:56px">' +
        '<span class="unit">°</span>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateDegrees(Number(document.getElementById(\'qtRotateDeg\').value))">+</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateDegrees(90)">+90</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applySelectionRotateDegrees(-90)">-90</button></div>' +

        '<div class="prop-group-title" style="margin-top:8px">Tỷ lệ chuẩn (bản vẽ KT)</div>' +
        '<p class="hint-text"><b>1:1</b> = giữ kích thước hiện tại (không đổi). <b>Về nguyên bản</b> = khôi phục hình lúc tạo. Nhập <b>A:B</b> rồi Áp dụng để phóng/thu.</p>' +
        '<div class="prop-row"><label>Tỷ lệ:</label>' +
        '<input type="text" id="qtScaleRatio" value="' + escapeHtmlValue((selectedRoom && selectedRoom.lastScaleRatio) || (selectedObject && selectedObject.data && selectedObject.data.lastScaleRatio) || '1:1') + '" ' +
        'placeholder="vd 1:2" style="width:80px" ' +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();applyStandardScaleRatioInput();}">' +
        '<button class="btn btn-sm btn-primary" type="button" onclick="applyStandardScaleRatioInput()">Áp dụng</button></div>' +
        '<div class="prop-row" style="gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(1,1)">1:1</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(2,1)">2:1</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(5,1)">5:1</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(10,1)">10:1</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(1,2)">1:2</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(1,5)">1:5</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="applyStandardScaleRatio(1,10)">1:10</button>' +
        '<button class="btn btn-sm btn-primary" type="button" onclick="restoreSelectionOriginalGeometry()" title="Khôi phục hình học lúc tạo đối tượng">Về nguyên bản</button></div>' +

        '<div class="prop-row" style="gap:4px;margin-top:6px">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="flipSelectionHorizontal()">Lật ngang</button>' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="flipSelectionVertical()">Lật dọc</button></div>' +
        '</div>';
}

function getSelectionRotationDeg() {
    var t = getQuickTransformTarget();
    if (!t || !t.data) return null;
    if (t.type === 'line' || t.type === 'wall') {
        if (typeof t.data.rotationDeg === 'number' && Number.isFinite(t.data.rotationDeg)) {
            return ((t.data.rotationDeg % 360) + 360) % 360;
        }
        if (typeof getPolylineHeadingDeg === 'function') {
            return getPolylineHeadingDeg(t.data);
        }
        return 0;
    }
    if (t.type !== 'room') return null;
    var r = t.data;
    if (typeof r.rotationDeg === 'number' && Number.isFinite(r.rotationDeg)) {
        return ((r.rotationDeg % 360) + 360) % 360;
    }
    // Ước lượng từ cạnh đầu (polygon) hoặc 0 với rect chưa xoay
    if (r.shape === 'polygon' && r.points && r.points.length >= 2) {
        var a = r.points[0], b = r.points[1];
        var deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        return ((deg % 360) + 360) % 360;
    }
    return 0;
}
window.getSelectionRotationDeg = getSelectionRotationDeg;

function toggleRoomAngleLabels() {
    window.showRoomAngleLabels = !window.showRoomAngleLabels;
    updatePropertiesPanel();
    draw();
    if (typeof showToast === 'function') {
        showToast(window.showRoomAngleLabels ? 'Đã bật hiện góc trên map' : 'Đã ẩn góc trên map', 'success');
    }
}
window.toggleRoomAngleLabels = toggleRoomAngleLabels;

function getQuickTransformTarget() {
    if (selectedRoom) return { type: 'room', data: selectedRoom };
    if (selectedObject && selectedObject.data) {
        return { type: selectedObject.type, data: selectedObject.data };
    }
    return null;
}

function applySelectionRotateDegrees(deg) {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    if (!Number.isFinite(deg) || deg === 0) return;
    saveState();
    EditorCore.ObjectTransform.rotateByDegrees(t.type, t.data, deg);
    if (t.data) {
        t.data.rotationDeg = (((typeof t.data.rotationDeg === 'number' ? t.data.rotationDeg : getSelectionRotationDeg() || 0) + deg) % 360 + 360) % 360;
    }
    updatePropertiesPanel();
    updateObjectList();
    draw();
    if (typeof showToast === 'function') {
        showToast('Xoay thêm ' + deg + '° → đang ' + (t.data.rotationDeg != null ? t.data.rotationDeg.toFixed(1) + '°' : ''), 'success');
    }
}
window.applySelectionRotateDegrees = applySelectionRotateDegrees;

/**
 * Xoay đến góc tuyệt đối (0–360) mà user yêu cầu.
 * delta = target − góc hiện tại (chuẩn hóa ±180 để quay đường ngắn).
 */
function applySelectionRotateToDegrees(targetDeg) {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    if (!Number.isFinite(targetDeg)) {
        if (typeof showToast === 'function') showToast('Nhập góc hợp lệ (0–360)', 'error');
        return;
    }
    targetDeg = ((targetDeg % 360) + 360) % 360;
    var current = 0;
    if (t.data && typeof t.data.rotationDeg === 'number') {
        current = ((t.data.rotationDeg % 360) + 360) % 360;
    } else {
        var g = getSelectionRotationDeg();
        current = g != null ? g : 0;
        if (t.data) t.data.rotationDeg = current;
    }
    var delta = targetDeg - current;
    // Quay đường ngắn hơn (±180)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) < 1e-6) {
        if (typeof showToast === 'function') showToast('Đã ở góc ' + targetDeg.toFixed(1) + '°', 'success');
        return;
    }
    saveState();
    EditorCore.ObjectTransform.rotateByDegrees(t.type, t.data, delta);
    t.data.rotationDeg = targetDeg;
    updatePropertiesPanel();
    updateObjectList();
    draw();
    if (typeof showToast === 'function') {
        showToast('Đã xoay đến ' + targetDeg.toFixed(1) + '°', 'success');
    }
}
window.applySelectionRotateToDegrees = applySelectionRotateToDegrees;

/**
 * Parse ô nhập tỷ lệ "A:B" hoặc "A/B" rồi gọi applyStandardScaleRatio.
 */
function applyStandardScaleRatioInput() {
    var el = document.getElementById('qtScaleRatio');
    var raw = el ? String(el.value || '').trim() : '';
    var m = raw.match(/^(\d+(?:\.\d+)?)\s*[:\/]\s*(\d+(?:\.\d+)?)$/);
    if (!m) {
        if (typeof showToast === 'function') {
            showToast('Nhập tỷ lệ dạng A:B (vd 1:2 hoặc 2:1)', 'error');
        }
        return;
    }
    applyStandardScaleRatio(Number(m[1]), Number(m[2]));
}
window.applyStandardScaleRatioInput = applyStandardScaleRatioInput;

/**
 * Tỷ lệ chuẩn bản vẽ kỹ thuật A:B → hệ số A/B.
 * 1:1 nguyên hình · 2:1 phóng to · 1:2 thu nhỏ.
 */
function applyStandardScaleRatio(a, b) {
    a = Number(a);
    b = Number(b);
    if (!(a > 0) || !(b > 0)) {
        if (typeof showToast === 'function') showToast('Tỷ lệ A:B không hợp lệ', 'error');
        return;
    }
    var label = a + ':' + b;
    var factor = a / b;
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    if (Math.abs(factor - 1) < 1e-9) {
        if (t.data) t.data.lastScaleRatio = label;
        updatePropertiesPanel();
        if (typeof showToast === 'function') {
            showToast('1:1 nguyên hình — kích thước giữ nguyên', 'success');
        }
        return;
    }
    saveState();
    EditorCore.ObjectTransform.scaleAboutCenter(t.type, t.data, factor);
    if (t.data) t.data.lastScaleRatio = label;
    updatePropertiesPanel();
    updateObjectList();
    draw();
    if (typeof showToast === 'function') {
        var kind = factor > 1 ? 'Phóng to' : 'Thu nhỏ';
        showToast(kind + ' ' + label + ' (×' + (Math.round(factor * 1000) / 1000) + ')', 'success');
    }
}
window.applyStandardScaleRatio = applyStandardScaleRatio;

/**
 * Khôi phục hình học lúc tạo (khác 1:1 — 1:1 chỉ giữ kích thước hiện tại).
 */
function restoreSelectionOriginalGeometry() {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    if (!t.data || !t.data._originalGeometry) {
        if (typeof showToast === 'function') {
            showToast('Không có dữ liệu nguyên bản (đối tượng tạo trước khi có tính năng này)', 'error');
        }
        return;
    }
    saveState();
    var ok = EditorCore.ObjectTransform.restoreOriginalGeometry(t.type, t.data);
    updatePropertiesPanel();
    updateObjectList();
    draw();
    if (typeof showToast === 'function') {
        showToast(ok ? 'Đã về nguyên bản lúc tạo' : 'Không khôi phục được nguyên bản', ok ? 'success' : 'error');
    }
}
window.restoreSelectionOriginalGeometry = restoreSelectionOriginalGeometry;

function applySelectionScaleFactor(factor) {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    if (!(factor > 0)) {
        if (typeof showToast === 'function') showToast('Tỷ lệ phải > 0', 'error');
        return;
    }
    if (Math.abs(factor - 1) < 1e-9) {
        if (typeof showToast === 'function') showToast('1:1 nguyên hình — không đổi kích thước', 'success');
        return;
    }
    saveState();
    EditorCore.ObjectTransform.scaleAboutCenter(t.type, t.data, factor);
    updatePropertiesPanel();
    updateObjectList();
    draw();
    if (typeof showToast === 'function') {
        showToast(factor < 1 ? ('Thu nhỏ ×' + factor) : ('Phóng to ×' + factor), 'success');
    }
}
window.applySelectionScaleFactor = applySelectionScaleFactor;

function flipSelectionHorizontal() {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    saveState();
    EditorCore.ObjectTransform.flipHorizontal(t.type, t.data);
    updatePropertiesPanel();
    draw();
    if (typeof showToast === 'function') showToast('Đã lật ngang', 'success');
}
window.flipSelectionHorizontal = flipSelectionHorizontal;

function flipSelectionVertical() {
    var t = getQuickTransformTarget();
    if (!t || !window.EditorCore || !EditorCore.ObjectTransform) return;
    saveState();
    EditorCore.ObjectTransform.flipVertical(t.type, t.data);
    updatePropertiesPanel();
    draw();
    if (typeof showToast === 'function') showToast('Đã lật dọc', 'success');
}
window.flipSelectionVertical = flipSelectionVertical;

// --- CỬA ---
function showDoorProps(d) {
    var desc = getInspectorDescriptor();
    var typeOptions = '';
    for (var i = 0; i < doorTypes.length; i++) {
        var sel = (d.type === doorTypes[i]) ? ' selected' : '';
        typeOptions += '<option' + sel + '>' + doorTypes[i] + '</option>';
    }

    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '🚪 Cửa #' + d.id }) +
        '<div class="prop-group">' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="updateObjProp(\'type\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Xoay:</label>' +
        '<input type="number" min="0" max="360" step="1" value="' + (d.rotation || 0) + '" onchange="updateObjProp(\'rotation\', Number(this.value))"><span class="unit">°</span></div>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- POI ---
function showPoiProps(p) {
    var desc = getInspectorDescriptor();
    var typeOptions = '';
    for (var i = 0; i < poiTypes.length; i++) {
        var sel = (p.typeIndex === i) ? ' selected' : '';
        typeOptions += '<option value="' + i + '"' + sel + '>' + poiTypes[i].icon + ' ' + poiTypes[i].name + '</option>';
    }

    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '📍 Điểm POI #' + p.id, skipKeys: ['category'] }) +
        '<div class="prop-group">' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="changePoiType(Number(this.value))">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Tọa độ X:</label>' +
        '<input type="number" value="' + Math.round(p.x) + '" onchange="updateObjProp(\'x\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(p.y) + '" onchange="updateObjProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- CAD POINT (điểm mốc) ---
function showCadPointProps(pt) {
    var styles = (typeof CAD_POINT_STYLES !== 'undefined') ? CAD_POINT_STYLES : ['dot', 'cross', 'plus', 'circle-cross'];
    var labels = (typeof CAD_POINT_STYLE_LABELS !== 'undefined') ? CAD_POINT_STYLE_LABELS : {};
    var styleOpts = styles.map(function (s) {
        var sel = ((typeof normalizePointStyle === 'function' ? normalizePointStyle(pt.style) : pt.style) === s) ? ' selected' : '';
        return '<option value="' + s + '"' + sel + '>' + (labels[s] || s) + '</option>';
    }).join('');
    var toM = (typeof pixelsToMeters === 'function') ? pixelsToMeters : function (v) { return v; };
    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">⌖ Điểm mốc #' + pt.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label><input type="text" value="' + (pt.name || '') + '" onchange="updateCadPointProp(\'name\', this.value)"></div>' +
        '<div class="prop-row"><label>X:</label><span>' + toM(pt.x).toFixed(2) + '</span><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Y:</label><span>' + toM(pt.y).toFixed(2) + '</span><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Kiểu:</label><select onchange="updateCadPointProp(\'style\', this.value)">' + styleOpts + '</select></div>' +
        '<div class="prop-row"><label>Màu:</label><input type="color" value="' + (pt.color || '#e11d48') + '" onchange="updateCadPointProp(\'color\', this.value)"></div>' +
        '<div class="prop-row"><label>Cỡ (px):</label><input type="number" min="4" max="24" value="' + (pt.size || 8) + '" onchange="updateCadPointProp(\'size\', +this.value)"></div>' +
        '<p class="hint-text">Điểm mốc CAD — tham chiếu snap NODE. Khác Điểm POI (tiện ích điều hướng).</p>' +
        '</div>' +
        (typeof renderQuickTransformHtml === 'function' ? renderQuickTransformHtml('point') : '') +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

function updateCadPointProp(key, value) {
    if (!selectedObject || selectedObject.type !== 'point' || !selectedObject.data) return;
    if (typeof saveState === 'function') saveState();
    var pt = selectedObject.data;
    if (key === 'style') pt.style = (typeof normalizePointStyle === 'function') ? normalizePointStyle(value) : value;
    else if (key === 'size') pt.size = Math.max(4, Math.min(24, Number(value) || 8));
    else if (key === 'color') pt.color = value || '#e11d48';
    else if (key === 'name') pt.name = String(value || '');
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof draw === 'function') draw();
}
window.updateCadPointProp = updateCadPointProp;
window.showCadPointProps = showCadPointProps;

// --- PATH NODE ---
function showNodeProps(n) {
    var desc = getInspectorDescriptor();
    var neighborsList = '';
    for (var i = 0; i < n.neighbors.length; i++) {
        var neighborId = n.neighbors[i];
        neighborsList += '<span style="display:inline-block;background:rgba(255,255,255,0.1);padding:2px 8px;margin:2px;border-radius:6px;font-size:0.8rem;white-space:nowrap;">' +
            '#' + neighborId + ' <b onclick="removeEdge(' + n.id + ',' + neighborId + ')" style="color:#ef4444;cursor:pointer;margin-left:4px;" title="Xóa kết nối">×</b></span>';
    }
    if (neighborsList === '') neighborsList = '<span style="color:var(--text-dim)">Chưa nối</span>';

    var typeOptions =
        '<option value="normal"' + (n.nodeType === 'normal' ? ' selected' : '') + '>🔵 Thường</option>' +
        '<option value="elevator"' + (n.nodeType === 'elevator' ? ' selected' : '') + '>🟢 Thang máy</option>' +
        '<option value="stairs"' + (n.nodeType === 'stairs' ? ' selected' : '') + '>🟣 Cầu thang</option>';

    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '🔵 Nút #' + n.id, skipKeys: ['radius'] }) +
        '<div class="prop-group">' +
        '<div class="prop-row"><label>Loại nút:</label>' +
        '<select onchange="updateNodeProp(\'nodeType\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(n.y) + '" onchange="updateNodeProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row" style="margin-top:10px;"><label>Nối tới ID:</label>' +
        '<div style="display:flex;gap:4px;flex:1;"><input type="number" id="manualEdgeTarget" placeholder="Mã..." style="width:60px;min-width:0;">' +
        '<button onclick="addManualEdge(' + n.id + ')" style="padding:2px 8px;background:var(--accent-primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;">+ Nối</button></div></div>' +
        '<div class="prop-row"><label>Danh sách kề:</label>' +
        '<div class="prop-val" style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:0.85rem;color:var(--text-dim);min-height:24px;">' + neighborsList + '</div></div>' +
        '</div>' +
        '<p class="hint-text">💡 Dùng công cụ Đường đi: click 2 nút liên tiếp để nối. Chuột phải để ngắt chuỗi.</p>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa đối tượng</button>';
}

function updateNodeProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'node') return;
    saveState();
    selectedObject.data[prop] = value;
    updateObjectList();
    draw();
}

// Thêm kết nối thủ công qua ID
function addManualEdge(fromId) {
    var targetInput = document.getElementById('manualEdgeTarget');
    var targetId = parseInt(targetInput.value);

    if (isNaN(targetId)) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập ID hợp lệ', 'error');
        return;
    }

    if (fromId === targetId) {
        if (typeof showToast === 'function') showToast('Không thể nối tới chính nó', 'error');
        return;
    }

    var nodeA = findNodeById(fromId);
    var nodeB = findNodeById(targetId);

    if (nodeA && nodeB) {
        saveState();
        connectNodes(nodeA, nodeB);
        updatePropertiesPanel();
        draw();
        if (typeof showToast === 'function') showToast('Đã nối #' + fromId + ' ↔ #' + targetId, 'success');
    } else {
        if (typeof showToast === 'function') showToast('Không tìm thấy Nút #' + targetId, 'error');
    }
}

// --- THUỘC TÍNH QR CODE ---
function showQrProps(qr) {
    var desc = getInspectorDescriptor();
    var qrNodeId = qr.node_id != null && qr.node_id !== '' ? Number(qr.node_id) : null;
    var nodesForQr = (typeof pathNodes !== 'undefined' && Array.isArray(pathNodes)) ? pathNodes : [];
    var nodeOptions = '<option value="">-- Không gán Node --</option>' +
        nodesForQr.map(function (n) {
            var selected = (qrNodeId === n.id) ? ' selected' : '';
            return '<option value="' + n.id + '"' + selected + '>' +
                n.id + ' (' + Math.round(n.x) + ',' + Math.round(n.y) + ')' +
                '</option>';
        }).join('');

    propertiesDiv.innerHTML =
        renderSchemaPropGroup(desc, { title: '🔳 Mốc QR #' + qr.id }) +
        '<div class="prop-group">' +
        '<div class="prop-row"><label>🔗 Gán Node:</label>' +
        '<select onchange="updateQrProp(\'node_id\', this.value || null)" ' +
        'style="width:100%;padding:4px;background:#2a2a3e;color:white;border:1px solid #4a4a6a;border-radius:4px;font-size:12px;">' +
        nodeOptions +
        '</select></div>' +
        '<div style="font-size:10px;color:#888;padding:2px 0 6px 0;"> ← TPF dùng Node này để khởi tạo vị trí khi quét QR</div>' +
        '<div class="prop-row"><label>Tọa độ X:</label>' +
        '<input type="number" value="' + Math.round(qr.x) + '" onchange="updateQrProp(\'x\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(qr.y) + '" onchange="updateQrProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Ảnh mã QR để in</div>' +
        '<div id="qrImageContainer" style="text-align:center; padding:10px; background:white; border-radius:4px; margin-bottom:10px;">' +
        '   <p style="font-size:11px; color:#7f8c8d;">Đang tạo mã...</p>' +
        '</div>' +
        '<button id="btnDownloadQr" class="btn-primary" style="width:100%; padding:8px; display:none;">💾 Tải ảnh QR (.png)</button>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa đối tượng</button>';

    // Sinh ảnh QR
    if (typeof generateQrImage === 'function') {
        generateQrImage(qr, function (url) {
            var container = document.getElementById('qrImageContainer');
            var btn = document.getElementById('btnDownloadQr');
            if (container) {
                container.innerHTML = '<img src="' + url + '" style="width:100%; max-width:150px; height:auto; display:block; margin:0 auto;">';
            }
            if (btn) {
                btn.style.display = 'block';
                btn.onclick = function () {
                    var link = document.createElement('a');
                    link.download = 'QR_' + qr.serial + '.png';
                    link.href = url;
                    link.click();
                };
            }
        });
    }
}

function updateQrProp(key, val) {
    if (!selectedObject || selectedObject.type !== 'qr') return;
    saveState();
    if (key === 'node_id') {
        val = (val === '' || val == null) ? null : parseInt(val, 10);
        if (val != null && isNaN(val)) val = null;
    }
    selectedObject.data[key] = val;
    updateObjectList();
    draw();
}

// === CẬP NHẬT THUỘC TÍNH ===
function updateRoomProp(prop, value) {
    if (!selectedRoom) return;
    applyDefaultRoomLabelStyle(selectedRoom);
    if (prop === 'labelRotation') {
        value = Number.isFinite(value) ? Math.max(-180, Math.min(180, value)) : 0;
    } else if (prop === 'labelFontSize') {
        value = Number.isFinite(value) ? Math.max(8, Math.min(96, value)) : 14;
    } else if (prop === 'labelLineHeight') {
        value = Number.isFinite(value) ? Math.max(1, Math.min(2.5, value)) : 1.2;
    } else if (prop === 'labelAutoScale') {
        value = !!value;
    }
    saveState();
    selectedRoom[prop] = value;
    if (prop === 'name') updateObjectList();
    draw();
}

/** Chỉnh chiều dài 1 cạnh đa giác (mét) — giữ đỉnh đầu, kéo đỉnh cuối. */
function updatePolygonEdgeLength(edgeIndex, lengthM) {
    if (!selectedRoom || selectedRoom.shape !== 'polygon') return;
    var minM = typeof getMinPolygonEdgeMeters === 'function' ? getMinPolygonEdgeMeters() : 0.0011;
    if (!Number.isFinite(lengthM) || lengthM < minM) {
        var minLabel = typeof formatMinPolygonEdgeLabel === 'function'
            ? formatMinPolygonEdgeLabel()
            : '1.1mm';
        if (typeof showToast === 'function') {
            showToast('Cạnh tối thiểu ' + minLabel, 'error');
        }
        updatePropertiesPanel();
        return;
    }
    if (typeof setPolygonEdgeLengthMeters !== 'function') return;
    saveState();
    if (!setPolygonEdgeLengthMeters(selectedRoom, edgeIndex, lengthM)) {
        if (typeof showToast === 'function') {
            showToast('Không đặt được cạnh ' + (edgeIndex + 1), 'error');
        }
        updatePropertiesPanel();
        return;
    }
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    updatePropertiesPanel();
    updateObjectList();
    draw();
}
window.updatePolygonEdgeLength = updatePolygonEdgeLength;

function updateObjProp(prop, value) {
    if (!selectedObject) return;
    saveState();
    selectedObject.data[prop] = value;
    if (prop === 'name') updateObjectList();
    draw();
}

function changePoiType(index) {
    if (!selectedObject || selectedObject.type !== 'poi') return;
    saveState();
    selectedObject.data.typeIndex = index;
    selectedObject.data.type = poiTypes[index].name;
    updateObjectList();
    draw();
}

// === XÓA ĐỐI TƯỢNG ĐANG CHỌN ===
function deleteSelected() {
    // Đợt 3 — nếu đang chọn nhiều đối tượng thì xóa cả tập
    if (typeof msIsMulti === 'function' && msIsMulti() && typeof msDeleteAll === 'function') {
        msDeleteAll();
        return;
    }
    if (!selectedObject && !selectedRoom) return;

    var target = selectedObject ? selectedObject.data : selectedRoom;
    if (typeof blockIfObjectLayerLocked === 'function' && blockIfObjectLayerLocked(target, 'xóa')) {
        return;
    }

    if (!confirm('Bạn có chắc chắn muốn xóa đối tượng này không?')) {
        return;
    }

    if (selectedObject) {
        saveState();
        var type = selectedObject.type;
        var data = selectedObject.data;

        if (type === 'room') {
            rooms = rooms.filter(function (r) { return r.id !== data.id; });
        } else if (type === 'door') {
            deleteDoor(data);
        } else if (type === 'wall') {
            deleteWall(data);
        } else if (type === 'line') {
            deleteLine(data);
        } else if (type === 'poi') {
            deletePoi(data);
        } else if (type === 'point') {
            if (typeof deleteCadPoint === 'function') deleteCadPoint(data);
        } else if (type === 'qr') {
            deleteQr(data);
        } else if (type === 'node') {
            deleteNode(data);
        } else if (type === 'blockRef') {
            deleteBlockInsert(data);
        } else if (type === 'dimension') {
            deleteDimension(data);
        }

        clearEditorSelection({ skipUi: true });
    } else if (selectedRoom) {
        saveState();
        rooms = rooms.filter(function (r) { return r.id !== selectedRoom.id; });
        clearEditorSelection({ skipUi: true });
    }

    if (roomCountSpan) roomCountSpan.textContent = rooms.length + ' Phòng';
    updatePropertiesPanel();
    updateObjectList();
    draw();
}

// === DANH SÁCH TẤT CẢ ĐỐI TƯỢNG ===
function updateObjectList() {
    if (!objectListDiv) return;
    objectListDiv.innerHTML = '';

    var totalItems = rooms.length + doors.length + pois.length + pathNodes.length
        + (walls ? walls.length : 0) + (lines ? lines.length : 0)
        + (typeof cadPoints !== 'undefined' && cadPoints ? cadPoints.length : 0)
        + (typeof blockInserts !== 'undefined' ? blockInserts.length : 0);
    if (totalItems === 0) {
        objectListDiv.innerHTML = '<p class="hint-text">Chưa có đối tượng</p>';
        return;
    }

    // Phòng
    rooms.forEach(function (room) {
        var isActive = (selectedObject && selectedObject.type === 'room' && selectedObject.data === room) || (selectedRoom === room);
        addListItem('⬛', room.name, pixelsToMeters(room.width).toFixed(1) + '×' + pixelsToMeters(room.height).toFixed(1) + 'm', room.color, isActive, function () {
            setEditorSelection('room', room);
        });
    });

    // Cửa
    doors.forEach(function (door) {
        var isActive = (selectedObject && selectedObject.type === 'door' && selectedObject.data === door);
        addListItem('🚪', door.name, door.type, '#e67e22', isActive, function () {
            setEditorSelection('door', door);
        });
    });

    // Tường
    walls.forEach(function (wall) {
        var isActive = (selectedObject && selectedObject.type === 'wall' && selectedObject.data === wall);
        addListItem('🧱', 'Tường #' + wall.id, (wall.is_outer ? 'Tường bao' : 'Tường thường'), '#111827', isActive, function () {
            setEditorSelection('wall', wall);
        });
    });

    // Đoạn thẳng hỗ trợ
    if (lines && lines.forEach) {
        lines.forEach(function (line) {
            var isActive = (selectedObject && selectedObject.type === 'line' && selectedObject.data === line);
            var isArc = line.type === 'arc';
            var isEllipse = line.type === 'ellipse';
            var lineIcon = isArc ? '◠' : (isEllipse ? '⬭' : '📏');
            var lineLabel = (isArc ? 'Cung #' : (isEllipse ? 'Elip #' : 'Đoạn #')) + line.id;
            addListItem(lineIcon, lineLabel, 'Hỗ trợ', line.color || '#3b82f6', isActive, function () {
                setEditorSelection('line', line);
            });
        });
    }

    pois.forEach(function (poi) {
        // Dữ liệu POI cũ có thể thiếu/sai typeIndex, nên fallback để không crash UI.
        var typeInfo = poiTypes[poi.typeIndex] || poiTypes[0];
        var isActive = (selectedObject && selectedObject.type === 'poi' && selectedObject.data === poi);
        addListItem(typeInfo.icon, poi.name, typeInfo.name, typeInfo.color, isActive, function () {
            setEditorSelection('poi', poi);
        });
    });

    // CAD Points (điểm mốc)
    if (typeof cadPoints !== 'undefined' && cadPoints) {
        cadPoints.forEach(function (cp) {
            var isActive = (selectedObject && selectedObject.type === 'point' && selectedObject.data === cp);
            addListItem('⌖', cp.name || ('Điểm #' + cp.id), 'Mốc CAD', cp.color || '#e11d48', isActive, function () {
                setEditorSelection('point', cp);
            });
        });
    }

    // QR Code
    qrs.forEach(function (qr) {
        var isActive = (selectedObject && selectedObject.type === 'qr' && selectedObject.data === qr);
        addListItem('🔳', qr.name, qr.serial, '#e67e22', isActive, function () {
            setEditorSelection('qr', qr);
        });
    });

    // Nodes
    pathNodes.forEach(function (node) {
        var isActive = (selectedObject && selectedObject.type === 'node' && selectedObject.data === node);
        addListItem('🔵', 'Nút #' + node.id, node.neighbors.length + ' nối', '#3498db', isActive, function () {
            setEditorSelection('node', node);
        });
    });

    // Block Inserts
    if (typeof blockInserts !== 'undefined') {
        blockInserts.forEach(function (bi) {
            var isActive = (selectedObject && selectedObject.type === 'blockRef' && selectedObject.data === bi);
            var def = typeof findBlockDefinition === 'function' ? findBlockDefinition(bi.blockId) : null;
            addListItem('📦', bi.name || 'Insert #' + bi.id, def ? def.name : bi.blockId, '#be123c', isActive, function () {
                setEditorSelection('blockRef', bi);
            });
        });
    }

    // Dimensions
    if (typeof dimensions !== 'undefined') {
        dimensions.forEach(function (dim) {
            var isActive = (selectedObject && selectedObject.type === 'dimension' && selectedObject.data === dim);
            var label = typeof formatDimensionLabel === 'function' ? formatDimensionLabel(dim) : ('#' + dim.id);
            var kind = dim.type === 'dimaligned' ? 'DAL' : 'DLI';
            var color = dim.type === 'dimaligned' ? '#c026d3' : '#e11d48';
            addListItem('📏', kind + ' #' + dim.id, label, color, isActive, function () {
                setEditorSelection('dimension', dim);
            });
        });
    }
}

// Thêm 1 item vào danh sách
function addListItem(icon, name, detail, color, isActive, onClick) {
    var div = document.createElement('div');
    div.className = 'obj-item' + (isActive ? ' selected' : '');
    div.innerHTML =
        '<span class="color-dot" style="background:' + color + '"></span>' +
        '<span>' + icon + ' ' + name + '</span>' +
        '<span style="margin-left:auto;color:#999;font-size:0.7rem">' + detail + '</span>';
    div.addEventListener('click', onClick);
    objectListDiv.appendChild(div);
}

// Cập nhật thuộc tính ảnh nền
window.updateBgProp = function(prop, value) {
    if (prop === 'bgX') window.bgX = value;
    else if (prop === 'bgY') window.bgY = value;
    else if (prop === 'bgScale') {
        if (value > 0) window.bgScale = value;
    }
    else if (prop === 'bgRotation') {
        window.bgRotation = value;
    }
    else if (prop === 'bgOpacity') {
        // Nếu giá trị > 1 (từ thanh trượt 0-100), chia cho 100
        window.bgOpacity = value > 1 ? value / 100 : value;
    }
    
    draw(); // Vẽ lại canvas để cập nhật thay đổi
}
