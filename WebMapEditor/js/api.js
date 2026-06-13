// ============================================================
// API.JS - Kết nối Web Map Editor với Backend Server
// ============================================================

const BASE_API_URL = 'http://localhost:5000/api';

// 1. Lấy thông tin từ URL và LocalStorage
const urlParams = new URLSearchParams(window.location.search);
const buildingId = urlParams.get('buildingId') || urlParams.get('building'); // Chấp nhận cả 2 cách gọi cho chắc chắn
let token = localStorage.getItem('token');   // WHY: dùng let để có thể cập nhật khi refresh
window.buildingId = buildingId;

// 2. Kiểm tra quyền truy cập
if (!token && buildingId) {
    // alert('Vui lòng đăng nhập để sử dụng tính năng lưu trữ đám mây!');
}

// ============================================================
// HELPER: Tự động gia hạn thẻ (Refresh Token)
// ------------------------------------------------------------
// WHY: Access token hết hạn sau 15p. Nếu đang vẽ dở mà không tự refresh
// sẽ khiến user bị văng ra ngoài, mất công sức.
// ============================================================
async function tryRefreshToken() {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;
    try {
        const r = await fetch(BASE_API_URL + '/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt })
        });
        if (!r.ok) return false;
        const j = await r.json();
        if (!j.token) return false;

        token = j.token; // Cập nhật biến local
        localStorage.setItem('token', j.token);
        return true;
    } catch (_) {
        return false;
    }
}

async function apiFetch(url, options = {}) {
    const opts = {
        ...options,
        headers: {
            ...(options.headers || {}),
            'Authorization': 'Bearer ' + token
        }
    };
    let res = await fetch(url, opts);

    if (res.status === 401) {
        console.warn('🔑 Access Token hết hạn, đang thử refresh...');
        const ok = await tryRefreshToken();
        if (ok) {
            opts.headers['Authorization'] = 'Bearer ' + token;
            res = await fetch(url, opts); // Thử lại lần 2 với token mới
        }
    }
    return res;
}

// ==========================================
// HÀM: HIỂN THỊ LOADING & THÔNG BÁO
// ==========================================
function showLoading(text) {
    var overlay = document.getElementById('loadingOverlay');
    var txt = document.getElementById('loadingText');
    if (overlay && txt) {
        txt.textContent = text || 'Đang xử lý...';
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showToast(message, type = 'success') {
    // Tạo container cho toast
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '12px';
    toast.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    toast.style.backdropFilter = 'blur(8px)';
    toast.style.color = 'white';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
    toast.style.zIndex = '10000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '500';
    toast.style.animation = 'slideIn 0.3s ease-out';

    // Icon mapping
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `<i data-lucide="${icon}" style="width:18px;height:18px"></i> <span>${message}</span>`;

    document.body.appendChild(toast);

    // Khởi tạo icon mới
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}
async function saveMapToServer() {
    if (!buildingId) {
        alert('Lỗi: Không tìm thấy ID tòa nhà! Vui lòng mở từ Dashboard.');
        return;
    }

    const floor = document.getElementById('floorSelect').value;
    const mapName = document.getElementById('mapName').value;

    // Gom toàn bộ dữ liệu hiện tại trên Canvas (Đồng bộ với Schema của Server)
    const mapData = {
        scale_ratio: (Number.isFinite(metersPerGrid) && metersPerGrid > 0) ? metersPerGrid : 0.5,
        background_image: bgImageBase64 || '',

        // 1. Phải là Object, không được là String
        rooms: rooms.filter(r => typeof r === 'object').map(r => ({
            id: r.id,
            name: r.name || 'Phòng mới',
            shape: r.shape || 'rect',
            color: r.color || '#ccc',
            labelRotation: Number.isFinite(r.labelRotation) ? r.labelRotation : 0,
            labelFontSize: Number.isFinite(r.labelFontSize) ? r.labelFontSize : 14,
            labelAutoScale: typeof r.labelAutoScale === 'boolean' ? r.labelAutoScale : true,
            labelLineHeight: Number.isFinite(r.labelLineHeight) ? r.labelLineHeight : 1.2,
            x: Math.round(r.x || 0),
            y: Math.round(r.y || 0),
            width: Math.round(r.width || 0),
            height: Math.round(r.height || 0),
            points: Array.isArray(r.points) ? r.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : [],
            cx: r.cx ? Math.round(r.cx) : undefined,
            cy: r.cy ? Math.round(r.cy) : undefined,
            radius: r.radius ? Math.round(r.radius) : undefined
        })),

        doors: doors.filter(d => typeof d === 'object').map(d => ({
            id: d.id,
            name: d.name || 'Cửa',
            x: Math.round(d.x || 0),
            y: Math.round(d.y || 0),
            width: d.width || 40,
            type: d.type || 'Đơn',
            rotation: d.rotation || 0
        })),

        pois: pois.filter(p => typeof p === 'object').map(p => ({
            id: p.id,
            name: p.name || 'P.O.I',
            x: Math.round(p.x || 0),
            y: Math.round(p.y || 0),
            type: p.type || 'Điểm mốc',
            typeIndex: p.typeIndex || 0
        })),

        // ĐỔI TÊN: pathNodes -> nodes
        nodes: pathNodes.filter(n => typeof n === 'object').map(n => ({
            id: n.id,
            x: Math.round(n.x || 0),
            y: Math.round(n.y || 0),
            neighbors: Array.isArray(n.neighbors) ? n.neighbors : [],
            is_elevator: n.nodeType === 'elevator',
            is_stairs: n.nodeType === 'stairs'
        })),

        // ĐỔI TÊN: pathEdges -> edges
        edges: pathEdges.filter(e => typeof e === 'object').map(e => ({
            source: String(e.from),
            target: String(e.to),
            distance: e.distance || 0
        })),

        walls: (walls || []).filter(w => typeof w === 'object').map(w => ({
            id: w.id,
            type: w.type || 'segment',
            thickness: w.thickness || 4,
            is_outer: !!w.is_outer,
            points: Array.isArray(w.points)
                ? w.points.map(p => ({ x: Math.round(p.x || 0), y: Math.round(p.y || 0) }))
                : []
        })),

        // ĐỔI TÊN: qrs -> qr_anchors
        qr_anchors: qrs.filter(q => typeof q === 'object').map(q => ({
            qr_id: q.serial || String(q.id),
            x: Math.round(q.x || 0),
            y: Math.round(q.y || 0),
            room_name: q.name || 'Vị trí QR',
            node_id: q.node_id || null  // Phương án B: Node được Admin gán để TPF khởi tạo hạt
        }))
    };

    console.log(`📤 SENDING: Đang gửi bản đồ lên Server...`, {
        buildingId: buildingId,
        floor: floor,
        rooms: mapData.rooms.length,
        nodes: mapData.nodes.length
    });

    showLoading('Đang lưu bản đồ lên Server...');

    try {
        const response = await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ map_data: mapData })
        });

        const result = await response.json().catch(() => ({}));
        hideLoading();

        if (response.ok) {
            showToast('Đã lưu bản đồ tầng ' + floor + ' thành công!');
            if (typeof clearAutoSave === 'function') clearAutoSave();
        } else if (response.status === 401) {
            // WHY: save bắt buộc đăng nhập (Publish là hành động ghi). Nếu token
            // hết hạn/missing, báo rõ cho admin biết phải làm gì thay vì nuốt lỗi.
            showToast('Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại để lưu.', 'error');
        } else {
            showToast(result.message || ('Lỗi lưu trữ (HTTP ' + response.status + ')'), 'error');
        }
    } catch (error) {
        hideLoading();
        console.error('API Error:', error);
        showToast('Lỗi kết nối tới Server', 'error');
    }
}

// ==========================================
// HÀM: TẢI BẢN ĐỒ TỪ SERVER VỀ
// ==========================================
function clearCanvasData() {
    // Xóa sạch các mảng dữ liệu
    rooms = [];
    doors = [];
    pois = [];
    pathNodes = [];
    pathEdges = [];
    walls = [];
    qrs = [];
    bgImage = null;
    bgImageBase64 = '';

    // Reset các ID tự tăng
    nextRoomId = 1;
    nextDoorId = 1;
    nextPoiId = 1;
    nextQrId = 1;
    nextNodeId = 1;
    nextWallId = 1;

    // Reset tên bản đồ về mặc định khi tạo mới
    var mapNameInput = document.getElementById('mapName');
    if (mapNameInput) mapNameInput.value = 'Bản đồ mới';

    // Quan trọng: xóa luôn bản nháp local để tránh restore nhầm bản đồ cũ
    if (typeof clearAutoSave === 'function') clearAutoSave();

    // Vẽ lại canvas trống
    if (typeof draw === 'function') draw();

    console.log('🧹 Đã xóa sạch dữ liệu trên Canvas.');
}

async function loadMapFromServer() {
    if (!buildingId) return { loaded: false, skipped: true };

    // QUAN TRỌNG: Xóa dữ liệu cũ trước khi nạp cái mới hoặc khi sang ID mới
    clearCanvasData();

    const floor = document.getElementById('floorSelect').value;
    showLoading('Đang tải dữ liệu tầng ' + floor + '...');

    // WHY: Tách thành 1 helper để thử 2 endpoint (private có auth → public)
    // mà không phải duplicate logic parse response.
    async function tryFetch(url, useAuth) {
        const headers = {};
        // WHY: useAuth check nếu cần dùng token (private endpoint)
        const resp = useAuth
            ? await apiFetch(url)
            : await fetch(url);

        if (resp.status === 404) return { notFound: true, resp };
        if (resp.status === 401) return { unauthorized: true, resp };
        const data = await resp.json().catch(() => null);
        return { ok: resp.ok, data, resp };
    }

    try {
        const privateUrl = `${BASE_API_URL}/maps/${buildingId}/${floor}`;
        const publicUrl = `${BASE_API_URL}/maps/${buildingId}/${floor}/public`;

        // Ưu tiên endpoint private (có auth) khi còn token; nếu 401/thiếu token
        // → rơi xuống endpoint public để admin vẫn xem + sửa được map (save
        // vẫn yêu cầu đăng nhập, xử lý riêng trong saveMapToServer).
        let result = token
            ? await tryFetch(privateUrl, true)
            : { unauthorized: true };

        if (result.unauthorized) {
            console.warn('🔒 Token không có hoặc đã hết hạn — fallback endpoint /public');
            showToast('Phiên đăng nhập hết hạn, tải ở chế độ xem. Đăng nhập lại để lưu.', 'error');
            result = await tryFetch(publicUrl, false);
        }

        hideLoading();

        if (result.notFound) {
            console.warn('Tầng này chưa có bản đồ trên Server.');
            return { loaded: false, notFound: true };
        }

        if (result.ok && result.data && result.data.map_data) {
            console.log('📥 Đã tải bản đồ từ Server:', result.data);
            applyMapData(result.data.map_data);
            return { loaded: true };
        }

        // Không khớp điều kiện nào ở trên → lỗi server / format lạ
        const msg = (result.data && result.data.message) || 'Không tải được bản đồ (HTTP ' + (result.resp && result.resp.status) + ')';
        showToast(msg, 'error');
        return { loaded: false };
    } catch (error) {
        hideLoading();
        console.error('Load Error:', error);
        showToast('Lỗi kết nối Server: ' + error.message, 'error');
        return { loaded: false, error: true };
    }
}

// Hàm bổ trợ để đổ dữ liệu vào state của Editor
function applyMapData(data) {
    if (data.mapName) document.getElementById('mapName').value = data.mapName;

    // 1. Phục hồi Tỷ lệ (scale_ratio -> metersPerGrid)
    var rawScale = null;
    if (data.scale_ratio !== undefined && data.scale_ratio !== null) {
        rawScale = data.scale_ratio;
    } else if (data.metersPerGrid !== undefined && data.metersPerGrid !== null) {
        rawScale = data.metersPerGrid;
    }
    var parsedScale = parseFloat(rawScale);
    metersPerGrid = (Number.isFinite(parsedScale) && parsedScale > 0) ? parsedScale : 0.5;
    document.getElementById('scaleInput').value = metersPerGrid.toFixed(2);

    // 2. Khôi phục Ảnh nền
    if (data.background_image) {
        bgImageBase64 = data.background_image;
        var img = new Image();
        img.onload = function () {
            bgImage = img;
            draw();
        };
        img.src = bgImageBase64;
    } else {
        bgImage = null;
        bgImageBase64 = '';
    }

    rooms = data.rooms || [];

    // Tự sửa lỗi ID cho các bản đồ cũ
    let maxId = 0;
    rooms.forEach(function (r, index) {
        applyDefaultRoomLabelStyle(r);
        if (!r.id || isNaN(r.id)) r.id = index + 1;
        if (r.id > maxId) maxId = r.id;
    });
    nextRoomId = maxId + 1;

    doors = data.doors || [];
    let maxDoorId = 0;
    doors.forEach(function (d, index) {
        if (!d.id || isNaN(d.id)) d.id = index + 1;
        if (d.id > maxDoorId) maxDoorId = d.id;
    });
    nextDoorId = maxDoorId + 1;

    pois = data.pois || [];
    let maxPoiId = 0;
    pois.forEach(function (p, index) {
        if (!p.id || isNaN(p.id)) p.id = index + 1;
        if (p.id > maxPoiId) maxPoiId = p.id;
    });
    nextPoiId = maxPoiId + 1;

    // 3. Khôi phục Nodes (nodes -> pathNodes)
    pathNodes = (data.nodes || data.pathNodes || []).map(n => ({
        id: parseInt(n.id),
        x: n.x,
        y: n.y,
        neighbors: (n.neighbors || []).map(nid => parseInt(nid)),
        nodeType: n.is_elevator ? 'elevator' : (n.is_stairs ? 'stairs' : 'normal')
    }));
    let maxNodeId = 0;
    pathNodes.forEach(function (n) {
        if (n.id > maxNodeId) maxNodeId = n.id;
    });
    nextNodeId = maxNodeId + 1;

    // 4. Khôi phục Edges (edges -> pathEdges)
    pathEdges = (data.edges || data.pathEdges || []).map(e => ({
        from: parseInt(e.source || e.from),
        to: parseInt(e.target || e.to),
        distance: e.distance || 0
    }));

    // 5. Khôi phục QRs (qr_anchors -> qrs)
    qrs = (data.qr_anchors || data.qrs || []).map(q => ({
        id: q.id || Math.floor(Math.random() * 1000),
        name: q.room_name || q.name,
        serial: q.qr_id || q.serial,
        x: q.x,
        y: q.y,
        node_id: q.node_id ? parseInt(q.node_id) : null
    }));
    let maxQrId = 0;
    qrs.forEach(function (q) {
        if (q.id > maxQrId) maxQrId = q.id;
    });
    nextQrId = maxQrId + 1;

    // 6. Khôi phục Walls
    walls = (data.walls || []).map(w => ({
        id: w.id || Math.floor(Math.random() * 100000),
        type: w.type || 'segment',
        thickness: w.thickness || 4,
        is_outer: !!w.is_outer,
        points: Array.isArray(w.points) ? w.points.map(p => ({ x: p.x, y: p.y })) : []
    }));
    let maxWallId = 0;
    walls.forEach(function (w) {
        if (w.id > maxWallId) maxWallId = w.id;
    });
    nextWallId = maxWallId + 1;

    // Vẽ lại toàn bộ
    updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
}
