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

// Vẽ tất cả edges — delegate PathRenderer
function drawPathEdges() {
    if (window.EditorCore && EditorCore.PathRenderer) {
        EditorCore.PathRenderer.renderPathEdges(ctx, { zoom: zoom }, pathEdges, findNodeById);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderPathEdges(ctx, { zoom: zoom }, pathEdges, findNodeById);
    }
}

// Vẽ 1 path node — delegate PathRenderer
function drawPathNode(node, isSelected) {
    var isStarting = (typeof firstNodeForEdge !== 'undefined' && firstNodeForEdge && firstNodeForEdge.id === node.id);
    var options = {
        nodeRadius: typeof NODE_RADIUS !== 'undefined' ? NODE_RADIUS : 8,
        isStarting: isStarting
    };
    if (window.EditorCore && EditorCore.PathRenderer) {
        EditorCore.PathRenderer.renderPathNode(ctx, { zoom: zoom }, node, isSelected, options);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderPathNode(ctx, { zoom: zoom }, node, isSelected, options);
    }
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
