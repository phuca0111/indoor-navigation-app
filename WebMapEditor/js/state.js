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

// Grid & Scale
const GRID_SIZE = 40;       // Kích thước ô lưới (pixels)
let metersPerGrid = 0.5;     // 1 ô = bao nhiêu mét (mặc định 1m = 80px)

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

// --- THƯỚC ĐO (RULER) ---
let rulerStart = null; // {x, y}
let rulerEnd = null;   // {x, y}
let isDrawingRuler = false;
let rulerLine = null; // {x1, y1, x2, y2}

// Background image (ảnh nền)
window.bgImage = null;       // Image object
window.bgOpacity = 0.5;      // Độ trong suốt
window.bgX = 0;              // Vị trí X của ảnh
window.bgY = 0;              // Vị trí Y của ảnh
window.bgScale = 1.0;        // Tỉ lệ phóng to/thu nhỏ
window.bgRotation = 0;       // Góc xoay của ảnh (độ)
window.bgImageBase64 = '';   // Dữ liệu ảnh dạng chuỗi (Base64) để lưu Server
window.isBgAdjustMode = false; // Chế độ điều chỉnh ảnh nền
window.bgLastX = 0;          // Vị trí chuột X cuối cùng khi kéo nền
window.bgLastY = 0;          // Vị trí chuột Y cuối cùng khi kéo nền

// Selected object (đối tượng đang chọn - dùng chung)
let selectedObject = null;  // {type: 'room'/'door'/'poi'/'node', data: ...}

// Constants
const HANDLE_SIZE = 8;
const POI_RADIUS = 12;      // Bán kính vòng tròn POI
const NODE_RADIUS = 8;      // Bán kính path node
