// ============================================================
// AUTODETECT.JS - Phát hiện phòng từ ảnh mặt bằng MÀU
// Hỗ trợ cả ảnh sạch (CAD) và ảnh TTTM đầy màu sắc
// ============================================================

var isDetecting = false;

// === HÀM CHÍNH: DETECT PHÒNG ===
function detectRoomsFromImage(img) {
    isDetecting = true;
    console.log('🔍 Bắt đầu detect phòng (V3 - Khử nhiễu)...');
    saveState(); 

    var tempCanvas = document.createElement('canvas');
    var tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    tempCtx.drawImage(img, 0, 0);

    var imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    var w = img.width;
    var h = img.height;

    // --- MỚI: LÀM MỜ ĐỂ KHỬ NHIỄU (BOX BLUR) ---
    // Giúp xóa bỏ các chữ nhỏ, logo li ti để không bị nhận nhầm là phòng
    var blurredData = boxBlur(imageData.data, w, h, 2); // Bán kính 2px

    // Dò cạnh từ ảnh đã làm mờ
    var edges = detectEdges(blurredData, w, h);

    // Làm dày edges mạnh hơn để đóng kín các phòng
    edges = dilateEdges(edges, w, h, 2);

    // Tìm vùng
    var regions = findRegions(edges, blurredData, w, h);

    // Lọc vùng và tạo phòng
    var count = createRoomsFromRegions(regions, w, h);

    console.log('✅ Hoàn tất dọn dẹp: ' + count + ' phòng');
    roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    updateObjectList();
    draw();
    isDetecting = false;
    return count;
}

// --- Thuật toán làm mờ ảnh đơn giản (Box Blur) ---
function boxBlur(data, w, h, rad) {
    var out = new Uint8ClampedArray(data.length);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var r = 0, g = 0, b = 0, count = 0;
            for (var dy = -rad; dy <= rad; dy++) {
                for (var dx = -rad; dx <= rad; dx++) {
                    var nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        var idx = (ny * w + nx) * 4;
                        r += data[idx]; g += data[idx+1]; b += data[idx+2];
                        count++;
                    }
                }
            }
            var oIdx = (y * w + x) * 4;
            out[oIdx] = r/count; out[oIdx+1] = g/count; out[oIdx+2] = b/count; out[oIdx+3] = 255;
        }
    }
    return out;
}

// === BƯỚC 1: PHÁT HIỆN CẠNH (Edge Detection) ===
function detectEdges(data, w, h) {
    var edges = new Uint8Array(w * h);
    var threshold = 35; // Tăng ngưỡng (cao hơn = bỏ qua nhiều chi tiết nhỏ hơn)

    for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
            var idx = (y * w + x) * 4;
            var r = data[idx], g = data[idx + 1], b = data[idx + 2];

            var idxR = idx + 4;
            var diffR = Math.abs(r - data[idxR]) + Math.abs(g - data[idxR + 1]) + Math.abs(b - data[idxR + 2]);

            var idxD = idx + w * 4;
            var diffD = Math.abs(r - data[idxD]) + Math.abs(g - data[idxD + 1]) + Math.abs(b - data[idxD + 2]);

            if (diffR > threshold || diffD > threshold) {
                edges[y * w + x] = 1;
            }

            // Lọc tường đen (nhạy hơn)
            var brightness = (r + g + b) / 3;
            if (brightness < 60) { // Tường/viền thường rất đậm
                edges[y * w + x] = 1;
            }
        }
    }
    return edges;
}

// === BƯỚC 2: LÀM DÀY CẠNH (Dilate) ===
function dilateEdges(edges, w, h, radius) {
    var result = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (edges[y * w + x] === 1) {
                for (var dy = -radius; dy <= radius; dy++) {
                    for (var dx = -radius; dx <= radius; dx++) {
                        var nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            result[ny * w + nx] = 1;
                        }
                    }
                }
            }
        }
    }
    return result;
}

// === BƯỚC 3: TÌM VÙNG (Flood Fill giữa các cạnh) ===
function findRegions(edges, data, w, h) {
    var visited = new Uint8Array(w * h);
    var regions = [];

    for (var i = 0; i < edges.length; i++) {
        if (edges[i] === 1) visited[i] = 1;
    }

    for (var y = 8; y < h - 8; y += 6) { // Nhảy bước lớn hơn
        for (var x = 8; x < w - 8; x += 6) {
            if (visited[y * w + x]) continue;

            var result = getRegionMask(visited, data, w, h, x, y);
            if (result && result.area > 500) { // Tăng diện tích tối thiểu ban đầu
                
                var contour = traceMooreNeighbor(result.mask, w, h, result.startIdx);
                if (contour && contour.length > 4) {
                    // Tăng epsilon (4.0) để đa giác "vuông vức" hơn, bỏ qua mép răng cưa
                    var simplified = simplifyDouglasPeucker(contour, 4.0);
                    
                    if (simplified.length >= 3) {
                        regions.push({
                            points: simplified, area: result.area,
                            avgR: result.avgR, avgG: result.avgG, avgB: result.avgB,
                            minX: result.minX, minY: result.minY,
                            width: result.maxX - result.minX, height: result.maxY - result.minY
                        });
                    }
                }
            }
        }
    }
    return regions;
}

// --- Flood Fill lấy mask ---
function getRegionMask(globalVisited, data, w, h, startX, startY) {
    var regionMask = new Uint8Array(w * h);
    var stack = [startX + startY * w];
    var area = 0;
    var totalR = 0, totalG = 0, totalB = 0;
    var minX = w, maxX = 0, minY = h, maxY = 0;
    var startIdx = startX + startY * w;

    while (stack.length > 0) {
        var pos = stack.pop();
        if (globalVisited[pos]) continue;

        globalVisited[pos] = 1;
        regionMask[pos] = 1;
        area++;

        var px = pos % w; var py = Math.floor(pos / w);
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;

        var dIdx = pos * 4;
        totalR += data[dIdx]; totalG += data[dIdx + 1]; totalB += data[dIdx + 2];

        if (px + 1 < w && !globalVisited[pos + 1]) stack.push(pos + 1);
        if (px - 1 >= 0 && !globalVisited[pos - 1]) stack.push(pos - 1);
        if (py + 1 < h && !globalVisited[pos + w]) stack.push(pos + w);
        if (py - 1 >= 0 && !globalVisited[pos - w]) stack.push(pos - w);
        if (area > 500000) return null;
    }
    return { 
        mask: regionMask, area: area, startIdx: startIdx,
        avgR: totalR/area, avgG: totalG/area, avgB: totalB/area,
        minX: minX, maxX: maxX, minY: minY, maxY: maxY
    };
}

// --- Dò biên Moore ---
function traceMooreNeighbor(mask, w, h, startIdx) {
    var contour = [];
    var curr = startIdx, prev = curr - 1;
    var neighbors = [-w-1, -w, -w+1, 1, w+1, w, w-1, -1];
    var start = curr, limit = 8000;

    while (limit-- > 0) {
        contour.push({ x: curr % w, y: Math.floor(curr / w) });
        var found = false;
        var startDir = neighbors.indexOf(prev - curr);
        if (startDir === -1) startDir = 0;

        for (var i = 1; i <= 8; i++) {
            var dirIdx = (startDir + i) % 8;
            var next = curr + neighbors[dirIdx];
            if (mask[next]) { prev = curr; curr = next; found = true; break; }
        }
        if (!found || curr === start) break;
    }
    return contour;
}

// --- Douglas-Peucker ---
function simplifyDouglasPeucker(points, epsilon) {
    if (points.length < 3) return points;
    var dmax = 0, index = 0, end = points.length - 1;
    for (var i = 1; i < end; i++) {
        var d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) { index = i; dmax = d; }
    }
    if (dmax > epsilon) {
        var res1 = simplifyDouglasPeucker(points.slice(0, index + 1), epsilon);
        var res2 = simplifyDouglasPeucker(points.slice(index), epsilon);
        return res1.slice(0, res1.length - 1).concat(res2);
    } else { return [points[0], points[end]]; }
}

function perpendicularDistance(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.sqrt(Math.pow(p.x-a.x, 2) + Math.pow(p.y-a.y, 2));
    var t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy);
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (a.x + t*dx), 2) + Math.pow(p.y - (a.y + t*dy), 2));
}

// === BƯỚC 4: LỌC & TẠO PHÒNG (Tối ưu AEON Mall) ===
function createRoomsFromRegions(regions, imgW, imgH) {
    var count = 0;
    // Tăng ngưỡng diện tích tối thiểu (0.15% ảnh) để bỏ rác chữ/logo
    var minArea = imgW * imgH * 0.0015; 
    var maxArea = imgW * imgH * 0.4;

    regions.sort(function (a, b) { return b.area - a.area; });

    for (var i = 0; i < regions.length; i++) {
        var r = regions[i];

        // Lọc kích thước gắt gao hơn
        if (r.area < minArea || r.area > maxArea) continue;
        if (r.width < 15 || r.height < 15) continue;
        if (r.minX < 10 || r.minY < 10 || r.minX + r.width > imgW - 10) continue;

        // Tránh tạo các vùng quá dài (hành lang mỏng hoặc nhiễu đường kẻ)
        var aspect = r.width / r.height;
        if (aspect > 15 || aspect < 0.06) continue;

        var roomColor = 'rgba(' + Math.min(255, r.avgR + 25) + ',' +
            Math.min(255, r.avgG + 25) + ',' +
            Math.min(255, r.avgB + 25) + ', 0.5)';

        var newRoom = {
            id: nextRoomId++,
            name: 'Phòng ' + (rooms.length + 1),
            shape: 'polygon',
            points: r.points,
            x: r.minX, y: r.minY, width: r.width, height: r.height,
            color: roomColor
        };
        
        rooms.push(newRoom);
        count++;

        if (count >= 100) break;
    }
    return count;
}
