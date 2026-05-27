// ==========================================
// Web Map Editor - Routing & Pathfinding (Dijkstra)
// ==========================================

let routingStartNodeId = null;
let routingEndNodeId = null;

function findShortestPath(startId, endId) {
    if (!customNodes[startId] || !customNodes[endId]) return null;

    const distances = {};
    const previous = {};
    const queue = [];

    Object.keys(customNodes).forEach(id => {
        distances[id] = Infinity;
        previous[id] = null;
        queue.push(id);
    });
    distances[startId] = 0;

    const adj = {};
    Object.keys(customNodes).forEach(id => adj[id] = []);
    customEdges.forEach(edge => {
        if (customNodes[edge.fromId] && customNodes[edge.toId]) {
            adj[edge.fromId].push(edge.toId);
            adj[edge.toId].push(edge.fromId);
        }
    });

    while (queue.length > 0) {
        queue.sort((a, b) => distances[a] - distances[b]);
        const current = queue.shift();

        if (current === endId) break;
        if (distances[current] === Infinity) break;

        for (const neighbor of adj[current]) {
            if (!queue.includes(neighbor)) continue;

            const currentCoords = customNodes[current];
            const neighborCoords = customNodes[neighbor];

            // คำนวณระยะขจัด 2 มิติ
            const dist = Math.sqrt((neighborCoords.x - currentCoords.x) ** 2 + (neighborCoords.y - currentCoords.y) ** 2);

            const alt = distances[current] + dist;
            if (alt < distances[neighbor]) {
                distances[neighbor] = alt;
                previous[neighbor] = current;
            }
        }
    }

    if (distances[endId] === Infinity) return null;

    const path = [];
    let curr = endId;
    while (curr !== null) {
        path.unshift(curr);
        curr = previous[curr];
    }

    return {
        path: path,
        distanceUnits: distances[endId],
        distanceMeters: distances[endId] * metersPerUnit
    };
}

function clearRouting() {
    routingStartNodeId = null;
    routingEndNodeId = null;
    const routingCard = document.getElementById('routing-card');
    if (routingCard) routingCard.style.display = 'none';
    renderAllElements();
}

function closeRouting() {
    clearRouting();
    setMode('addAndDrag');
}
