// ============================================================
// STATE.JS - Biến trạng thái toàn cục
// ============================================================

// DOM Elements - Sử dụng hàm an toàn để tránh crash
function getEl(id) { return document.getElementById(id); }

const canvas = getEl('mapCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const wrapper = document.querySelector('.canvas-wrapper');
const mousePosSpan = getEl('mousePos');
const worldPosSpan = getEl('worldPos');
const zoomLevelSpan = getEl('zoomLevel');
const currentToolSpan = getEl('currentToolStatus');
const roomCountSpan = getEl('roomCount');
const propertiesDiv = getEl('properties');
const objectListDiv = getEl('object-list');

// Tool state
let currentTool = 'select';

// Zoom & Pan
let zoom = 1;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX, panStartY;

// Grid & Scale — chuẩn dự án: 1 ô 40px = 0.5m (scale_ratio 0.5)
var GRID_SIZE = 40;
let metersPerGrid = 0.5;
/** true sau khi load map từ server — không cho đổi tỷ lệ (Phương án A) */
let scaleLockedFromServer = false;

// Room data
let rooms = [];
let selectedRoom = null;
let nextRoomId = 1;

// Wall data (tường)
let walls = [];
let nextWallId = 1;
let wallStartPoint = null;
let wallPreviewEnd = null;

// Drawing state (vẽ phòng mới)
let isDrawing = false;
let drawStartX, drawStartY;
let drawCurrentX, drawCurrentY;

// Polygon drawing state (vẽ đa giác)
let polygonPoints = [];  // Mảng điểm đang vẽ
let isDrawingPolygon = false;

// Dragging state (kéo phòng)
let isDragging = false;
window.isDraggingBg = false;
let dragOffsetX, dragOffsetY;

// Resizing state
let isResizing = false;
let resizeHandle = null;
let resizeStartRoom = null;
let isResizingDoor = false;
let resizeDoorSide = null; // 'left' hoặc 'right'
let isRotatingDoor = false;

// Polygon vertex dragging
let isDraggingVertex = false;
let draggingVertexIndex = -1;

// Door data (cửa)
let doors = [];
let nextDoorId = 1;

// POI data (điểm đánh dấu)
let pois = [];
let nextPoiId = 1;

// QR Code data (mốc định vị quét mã)
let qrs = [];
let nextQrId = 1;

// Path data (đường đi)
let pathNodes = [];
let pathEdges = [];
let nextNodeId = 1;
let firstNodeForEdge = null; // node đầu khi đang nối edge
/** Preview chuỗi path khi Shift + di chuột */
let pathPreviewEnd = null;
/** Con trỏ rubber-band khi vẽ polygon */
let polygonHoverPoint = null;

// --- THƯỚC ĐO (RULER) ---
let rulerStart = null;
let rulerEnd = null;
let isDrawingRuler = false;
/** true sau click điểm A — chờ click điểm B (không cần giữ chuột kéo) */
let rulerAwaitingEnd = false;
/** 'measure' = chỉ đo | 'calibrate' = căn tỷ lệ (SCALE Reference) */
let rulerMode = 'measure';

// Background image (ảnh nền)
window.bgImage = null;       // Image object
window.bgOpacity = 0.5;      // Độ trong suốt
window.bgX = 0;              // Vị trí X của ảnh
window.bgY = 0;              // Vị trí Y của ảnh
window.bgScale = 1.0;        // Tỉ lệ phóng to/thu nhỏ
window.bgRotation = 0;       // Góc xoay của ảnh (độ)
window.mapBearingOffset = 0; // Góc lệch Bắc địa lý so với trục map (độ) — Android la bàn
window.bgImageBase64 = '';   // Dữ liệu ảnh dạng chuỗi (Base64) để lưu Server
window.isBgAdjustMode = false; // Chế độ điều chỉnh ảnh nền
window.bgLastX = 0;          // Vị trí chuột X cuối cùng khi kéo nền
window.bgLastY = 0;          // Vị trí chuột Y cuối cùng khi kéo nền

// Selected object (đối tượng đang chọn - dùng chung)
let selectedObject = null;  // {type: 'room'/'door'/'poi'/'node', data: ...}

// Constants — override từ config/editor.json
var HANDLE_SIZE = 8;
var POI_RADIUS = 12;
var NODE_RADIUS = 8;

function syncStateFromEditorConfig() {
    if (typeof window === 'undefined' || !window.EditorCore || !EditorCore.Config) return;
    var C = EditorCore.Config;
    GRID_SIZE = C.get('grid.size', 40);
    HANDLE_SIZE = C.get('ui.handleSize', 8);
    POI_RADIUS = C.get('ui.poiRadius', 12);
    NODE_RADIUS = C.get('ui.nodeRadius', 8);
    rulerMode = C.get('ruler.defaultMode', 'measure');
}
syncStateFromEditorConfig();
window.syncStateFromEditorConfig = syncStateFromEditorConfig;
