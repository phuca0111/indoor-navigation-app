// ============================================================
// PATHS.JS - Logic đường đi: Node + Edge (đơn giản)
// ============================================================

// Tạo path node mới
function createPathNode(x, y) {
    var node = {
        id: nextNodeId++,
        x: snapToGrid(x),
        y: snapToGrid(y),
        nodeType: 'normal', // 'normal', 'elevator', 'stairs'
        neighbors: []  // Danh sách id các node kề
    };
    pathNodes.push(node);
    return node;
}

// Tìm path node tại vị trí click
function findNodeAt(wx, wy) {
    for (var i = pathNodes.length - 1; i >= 0; i--) {
        var n = pathNodes[i];
        var dx = wx - n.x;
        var dy = wy - n.y;
        if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) {
            return n;
        }
    }
    return null;
}

// Nối 2 node tạo edge
function connectNodes(nodeA, nodeB) {
    if (nodeA.id === nodeB.id) return; // Không nối chính nó

    // Kiểm tra đã nối chưa
    if (nodeA.neighbors.indexOf(nodeB.id) !== -1) return;

    // Thêm vào danh sách neighbors (2 chiều)
    nodeA.neighbors.push(nodeB.id);
    nodeB.neighbors.push(nodeA.id);

    // Lưu edge
    pathEdges.push({
        from: nodeA.id,
        to: nodeB.id
    });
}

// Xóa cạnh nối giữa 2 node
function removeEdge(idA, idB) {
    if (typeof saveState === 'function') saveState();
    
    // Xóa khỏi neighbors của A
    var nodeA = findNodeById(idA);
    if (nodeA) nodeA.neighbors = nodeA.neighbors.filter(function(id) { return id !== idB; });
    
    // Xóa khỏi neighbors của B
    var nodeB = findNodeById(idB);
    if (nodeB) nodeB.neighbors = nodeB.neighbors.filter(function(id) { return id !== idA; });
    
    // Xóa khỏi danh sách edges
    pathEdges = pathEdges.filter(function(e) {
        return !((e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
    });
    
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
}

// Vẽ tất cả edges (đường nối) theo phong cách Navigator Glow
function drawPathEdges() {
    // 1. Vẽ lớp bóng phát sáng (Outer Glow)
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
    ctx.lineWidth = 8 / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (var i = 0; i < pathEdges.length; i++) {
        var edge = pathEdges[i];
        var nodeA = findNodeById(edge.from);
        var nodeB = findNodeById(edge.to);
        if (nodeA && nodeB) {
            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.stroke();
        }
    }

    // 2. Vẽ lớp đường chính (Inner Core)
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 4 / zoom;
    ctx.setLineDash([]); // Đảm bảo không còn nét đứt
    
    for (var i = 0; i < pathEdges.length; i++) {
        var edge = pathEdges[i];
        var nodeA = findNodeById(edge.from);
        var nodeB = findNodeById(edge.to);
        if (nodeA && nodeB) {
            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.stroke();
        }
    }
}

// Vẽ 1 path node
function drawPathNode(node, isSelected) {
    var color = '#3498db'; // Mặc định: Xanh dương
    var label = node.id;

    if (node.nodeType === 'elevator') {
        color = '#2ecc71'; // Thang máy: Xanh lá
        label = 'E';
    } else if (node.nodeType === 'stairs') {
        color = '#9b59b6'; // Cầu thang: Tím
        label = 'S';
    }

    // Vòng tròn
    ctx.beginPath();
    // Highlight đặc biệt nếu là node bắt đầu nối (firstNodeForEdge)
    var isStarting = (typeof firstNodeForEdge !== 'undefined' && firstNodeForEdge && firstNodeForEdge.id === node.id);
    
    ctx.fillStyle = isSelected ? '#f39c12' : (isStarting ? '#e67e22' : color);
    ctx.fill();
    ctx.strokeStyle = isStarting ? '#ffffff' : (isSelected ? '#e74c3c' : '#2980b9');
    ctx.lineWidth = (isSelected || isStarting) ? 3 / zoom : 1.5 / zoom;
    ctx.stroke();

    // Số ID hoặc nhãn bên trong
    var fontSize = Math.max(10, 12 / zoom); // Tăng kích thước tối thiểu từ 6 lên 10
    ctx.font = 'bold ' + fontSize + 'px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; // Thêm viền chữ cho nổi bật
    ctx.lineWidth = 2 / zoom;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(label, node.x, node.y);
    ctx.fillText(label, node.x, node.y);
}

// Tìm node theo ID
function findNodeById(id) {
    for (var i = 0; i < pathNodes.length; i++) {
        if (pathNodes[i].id === id) return pathNodes[i];
    }
    return null;
}

// Xóa node (và các edge liên quan)
function deleteNode(node) {
    // Xóa các edge chứa node này
    pathEdges = pathEdges.filter(function (e) {
        return e.from !== node.id && e.to !== node.id;
    });

    // Xóa node khỏi neighbors của các node khác
    for (var i = 0; i < pathNodes.length; i++) {
        var n = pathNodes[i];
        n.neighbors = n.neighbors.filter(function (nid) { return nid !== node.id; });
    }

    // Xóa node
    pathNodes = pathNodes.filter(function (n) { return n.id !== node.id; });
}
