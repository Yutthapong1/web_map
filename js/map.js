// ==========================================
// Web Map Editor - Leaflet Renderers & Calibrations
// ==========================================

let markersMap = {};
let polylinesArray = [];
let metersPerUnit = 1.0;
let isCalibrated = false;

// ทิศเหนือของแผนที่ (North Direction Configuration)
let mapNorthAngle = 0; // มุมองศา 0-359
let northCompassPos = null; // ตำแหน่ง { x, y, floor } สำหรับวาดรูปเข็มทิศบนแผนที่
let northCompassMarker = null; // เก็บ Leaflet Marker ตัวจริงของเข็มทิศ

// Calibration state
let calibrationPoints = [];
let calibrationTempMarkerStart = null;
let calibrationTempMarkerEnd = null;
let calibrationTempLine = null;

function toLatLng(x, y) { return [MAP_HEIGHT - y, x]; }
function toXY(latlng) {
    return {
        x: parseFloat(latlng.lng.toFixed(1)),
        y: parseFloat((MAP_HEIGHT - latlng.lat).toFixed(1))
    };
}

function getNodeColor(type, id) {
    if (currentMode === 'delete') return 'var(--delete-color)';
    if (selectedNodeForEdge === id) return '#ff9800';
    if (myLocationNodeId === id) return 'var(--primary)';
    if (currentMode === 'routing') {
        if (routingStartNodeId === id) return '#3b82f6';
        if (routingEndNodeId === id) return '#10b981';
    }

    switch (type) {
        case 'ramp': return 'var(--ramp-color)';
        case 'stairs': return 'var(--stairs-color)';
        case 'elevator': return 'var(--elevator-color)';
        case 'waypoint': return '#94a3b8';
        case 'normal':
        default: return 'var(--normal-color)';
    }
}

function getNodeIconHtml(type, id, major, minor) {
    let iconClass = 'fa-circle';
    let extraIcon = '';

    if (major !== undefined && minor !== undefined && major !== null && minor !== null) {
        extraIcon = `<i class="fa-solid fa-bluetooth pulse-effect" style="color: #0284c7; font-size: 10px; position: absolute; margin-top: -12px; margin-left: 10px;"></i>`;
    }

    if (myLocationNodeId === id && currentMode !== 'delete') iconClass = 'fa-star';
    else if (currentMode === 'routing' && routingStartNodeId === id) iconClass = 'fa-circle-dot';
    else if (currentMode === 'routing' && routingEndNodeId === id) iconClass = 'fa-flag-checkered';
    else {
        if (type === 'ramp') iconClass = 'fa-wheelchair';
        else if (type === 'stairs') iconClass = 'fa-stairs';
        else if (type === 'elevator') iconClass = 'fa-elevator';
    }
    return `<div style="position: relative;">
                <i class="fa-solid ${iconClass}" style="color: ${getNodeColor(type, id)}; font-size: 16px;"></i>
                ${extraIcon}
            </div>`;
}

function renderAllElements() {
    Object.values(markersMap).forEach(m => map.removeLayer(m));
    polylinesArray.forEach(p => map.removeLayer(p));
    markersMap = {};
    polylinesArray = [];

    // วาดเส้นเชื่อม (Edges)
    customEdges.forEach((edge, index) => {
        const fromNode = customNodes[edge.fromId];
        const toNode = customNodes[edge.toId];

        if (fromNode && toNode) {
            const isDeleteMode = (currentMode === 'deleteEdge');
            const sameFloor = (fromNode.floor === currentFloor && toNode.floor === currentFloor);
            const leadsToCurrentFloor = (fromNode.floor === currentFloor || toNode.floor === currentFloor);

            if (sameFloor) {
                const polyline = L.polyline([
                    toLatLng(fromNode.x, fromNode.y),
                    toLatLng(toNode.x, toNode.y)
                ], {
                    color: isDeleteMode ? '#f57c00' : '#475569',
                    weight: isDeleteMode ? 5 : 3,
                    opacity: 0.8
                }).addTo(map);

                const distUnits = Math.sqrt((toNode.x - fromNode.x) ** 2 + (toNode.y - fromNode.y) ** 2);
                const distMeters = distUnits * metersPerUnit;
                const tooltipText = `${distMeters.toFixed(2)} ม. (${distUnits.toFixed(1)} unit)`;

                polyline.bindTooltip(tooltipText, {
                    sticky: true,
                    className: 'edge-tooltip'
                });

                polyline.on('click', (e) => {
                    if (currentMode === 'deleteEdge') {
                        L.DomEvent.stopPropagation(e);
                        deleteEdgeByIndex(index);
                    }
                });

                polylinesArray.push(polyline);
            }
            else if (leadsToCurrentFloor) {
                const polyline = L.polyline([
                    toLatLng(fromNode.x, fromNode.y),
                    toLatLng(toNode.x, toNode.y)
                ], {
                    color: '#7b1fa2', // สีบันไดข้ามชั้น
                    weight: 3,
                    dashArray: '5, 8',
                    opacity: 0.6
                }).addTo(map);

                const otherFloor = (fromNode.floor === currentFloor) ? toNode.floor : fromNode.floor;
                polyline.bindTooltip(`บันได/ลิฟต์เชื่อมไปยังชั้น ${otherFloor}`, {
                    sticky: true,
                    className: 'edge-tooltip'
                });

                polyline.on('click', (e) => {
                    if (currentMode === 'deleteEdge') {
                        L.DomEvent.stopPropagation(e);
                        deleteEdgeByIndex(index);
                    }
                });

                polylinesArray.push(polyline);
            }
        }
    });

    // วาดหมุดโหนด (Markers)
    Object.keys(customNodes).forEach(key => {
        const node = customNodes[key];

        if (node.floor !== currentFloor) return;

        const pos = toLatLng(node.x, node.y);
        const isWaypoint = node.type === 'waypoint';

        let htmlContent = '';
        if (isWaypoint) {
            const isSelected = (selectedNodeForEdge === node.id || myLocationNodeId === node.id) ? 'box-shadow: 0 0 0 4px rgba(255,152,0,0.5);' : '';
            const color = selectedNodeForEdge === node.id ? '#ff9800' : '#94a3b8';
            htmlContent = `<div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; border: 2px solid white; ${isSelected}"></div>`;
        } else {
            htmlContent = `
            <div class="custom-node-html">
                ${getNodeIconHtml(node.type, node.id, node.beaconMajor, node.beaconMinor)}
                <div class="node-label" style="border-top: 3px solid ${getNodeColor(node.type, node.id)}">
                    ${node.name}<br>(${node.x}, ${node.y})
                </div>
            </div>`;
        }

        const customIcon = L.divIcon({
            className: 'custom-marker-wrapper',
            html: htmlContent,
            iconSize: isWaypoint ? [12, 12] : [70, 45],
            iconAnchor: isWaypoint ? [6, 6] : [35, 8]
        });

        const marker = L.marker(pos, { icon: customIcon, draggable: (currentMode === 'addAndDrag') }).addTo(map);
        markersMap[node.id] = marker;

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            handleNodeClick(node);
        });

        marker.on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e);
            myLocationNodeId = node.id;
            renderAllElements();
        });

        marker.on('dragend', (event) => {
            const newPos = event.target.getLatLng();
            const coords = toXY(newPos);
            node.x = Math.max(0, Math.min(MAP_WIDTH, coords.x));
            node.y = Math.max(0, Math.min(MAP_HEIGHT, coords.y));

            const editCard = document.getElementById('edit-node-card');
            const editId = document.getElementById('edit-node-id');
            if (editCard && editCard.style.display === 'block' && editId && editId.value === node.id) {
                document.getElementById('edit-node-x').value = node.x;
                document.getElementById('edit-node-y').value = node.y;
            }
            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        });
    });

    // วาดเส้นทางคำนวณ Dijkstra (ถ้ากำลังทดสอบหาเส้นทาง)
    const routeCard = document.getElementById('routing-card');
    const routeInfo = document.getElementById('route-info-detail');

    if (routingStartNodeId && routingEndNodeId) {
        const routeResult = findShortestPath(routingStartNodeId, routingEndNodeId);
        if (routeResult) {
            const latlngs = routeResult.path.map(id => {
                const n = customNodes[id];
                return toLatLng(n.x, n.y);
            });

            const routePolyline = L.polyline(latlngs, {
                color: '#10b981',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            polylinesArray.push(routePolyline);

            if (routeInfo) {
                routeInfo.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <span style="background-color: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px;">ต้นทาง</span>
                    <strong>${customNodes[routingStartNodeId].name} (ชั้น ${customNodes[routingStartNodeId].floor})</strong>
                </div>
                <div style="margin-bottom: 12px;">
                    <span style="background-color: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px;">ปลายทาง</span>
                    <strong>${customNodes[routingEndNodeId].name} (ชั้น ${customNodes[routingEndNodeId].floor})</strong>
                </div>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 16px; color: #10b981; font-weight: 800; display: flex; align-items: center; gap: 6px;" class="pulse-effect">
                    <i class="fa-solid fa-walking"></i> ระยะทางรวม: ${routeResult.distanceMeters.toFixed(2)} เมตร
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                    (ประมวลผลผ่านบันได/ลิฟต์สำเร็จ)
                </div>
            `;
            }
            if (routeCard) routeCard.style.display = 'block';
        } else {
            if (routeInfo) {
                routeInfo.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <span style="background-color: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px;">ต้นทาง</span>
                    <strong>${customNodes[routingStartNodeId].name}</strong>
                </div>
                <div style="margin-bottom: 8px;">
                    <span style="background-color: #cbd5e1; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px;">ปลายทาง</span>
                    <strong>${customNodes[routingEndNodeId].name}</strong>
                </div>
                <div style="color: #ef4444; font-weight: bold; margin-top: 10px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ไม่พบเส้นทางข้ามชั้นเชื่อมต่อกัน
                </div>
            `;
            }
            if (routeCard) routeCard.style.display = 'block';
        }
    } else if (routingStartNodeId) {
        if (routeInfo) {
            routeInfo.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span style="background-color: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px;">ต้นทาง</span>
                <strong>${customNodes[routingStartNodeId].name}</strong>
            </div>
            <div style="color: #3b82f6; font-weight: bold; margin-top: 10px;" class="pulse-effect">
                <i class="fa-solid fa-circle-dot"></i> กรุณาเลือกจุดปลายทางบนแผนที่...
            </div>
        `;
        }
        if (routeCard) routeCard.style.display = 'block';
    } else {
        if (currentMode === 'routing') {
            if (routeInfo) {
                routeInfo.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 10px 0;">
                    <i class="fa-solid fa-hand-pointer" style="font-size: 20px; color: #3b82f6; margin-bottom: 6px;"></i><br>
                    กรุณาคลิกเลือกโหนดเริ่มต้นบนแผนที่
                </div>
            `;
            }
            if (routeCard) routeCard.style.display = 'block';
        } else {
            if (routeCard) routeCard.style.display = 'none';
        }
    }

    // วาดเข็มทิศระบุทิศเหนือ (Compass Dial)
    if (northCompassMarker) {
        map.removeLayer(northCompassMarker);
        northCompassMarker = null;
    }

    if (northCompassPos && northCompassPos.floor === currentFloor) {
        const pos = toLatLng(northCompassPos.x, northCompassPos.y);
        const isSetNorthMode = (currentMode === 'setNorth');
        const size = isSetNorthMode ? 100 : 40;
        const halfSize = size / 2;

        const compassHtml = `
            <div class="compass-dial-container ${isSetNorthMode ? '' : 'minimized'}" style="width: ${size}px; height: ${size}px; position: relative;">
                <div class="compass-ring" id="map-compass-ring" style="width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; cursor: ${isSetNorthMode ? 'grab' : 'default'};">
                    <span style="position: absolute; top: ${isSetNorthMode ? '4px' : '2px'}; font-size: ${isSetNorthMode ? '11px' : '6px'}; font-weight: bold; color: #ef4444; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">N</span>
                    <span style="position: absolute; right: 6px; font-size: 8px; font-weight: bold; color: var(--text-muted); display: ${isSetNorthMode ? 'block' : 'none'};">E</span>
                    <span style="position: absolute; bottom: 4px; font-size: 8px; font-weight: bold; color: var(--text-muted); display: ${isSetNorthMode ? 'block' : 'none'};">S</span>
                    <span style="position: absolute; left: 6px; font-size: 8px; font-weight: bold; color: var(--text-muted); display: ${isSetNorthMode ? 'block' : 'none'};">W</span>
                    
                    <div class="compass-needle" style="width: ${isSetNorthMode ? '6px' : '3px'}; height: ${isSetNorthMode ? '70px' : '28px'}; position: relative; display: flex; flex-direction: column; align-items: center; transform: rotate(${mapNorthAngle}deg); transition: transform 0.05s ease;">
                        <div style="width: 0; height: 0; border-left: ${isSetNorthMode ? '5px' : '2.5px'} solid transparent; border-right: ${isSetNorthMode ? '5px' : '2.5px'} solid transparent; border-bottom: ${isSetNorthMode ? '30px' : '12px'} solid #ef4444; margin-bottom: ${isSetNorthMode ? '2px' : '1px'};"></div>
                        <div style="width: 0; height: 0; border-left: ${isSetNorthMode ? '5px' : '2.5px'} solid transparent; border-right: ${isSetNorthMode ? '5px' : '2.5px'} solid transparent; border-top: ${isSetNorthMode ? '30px' : '12px'} solid #a1a1aa;"></div>
                    </div>
                    
                    <div style="width: ${isSetNorthMode ? '10px' : '4px'}; height: ${isSetNorthMode ? '10px' : '4px'}; background: #f4f4f5; border-radius: 50%; border: ${isSetNorthMode ? '2px' : '1px'} solid #ef4444; position: absolute; z-index: 10;"></div>
                </div>
            </div>
        `;

        const compassIcon = L.divIcon({
            className: 'compass-dial-wrapper',
            html: compassHtml,
            iconSize: [size, size],
            iconAnchor: [halfSize, halfSize]
        });

        northCompassMarker = L.marker(pos, {
            icon: compassIcon,
            draggable: isSetNorthMode,
            interactive: isSetNorthMode
        }).addTo(map);

        northCompassMarker.on('dragend', (event) => {
            const newPos = event.target.getLatLng();
            const coords = toXY(newPos);
            northCompassPos.x = Math.max(0, Math.min(MAP_WIDTH, coords.x));
            northCompassPos.y = Math.max(0, Math.min(MAP_HEIGHT, coords.y));

            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        });

        setTimeout(() => {
            setupCompassDragEvents();
        }, 50);
    }
}

function updateScaleBadge() {
    const icon = document.getElementById('calib-indicator-icon');
    const statusText = document.getElementById('calib-status-text');
    const descText = document.getElementById('calib-desc-text');

    if (isCalibrated) {
        if (icon) {
            icon.className = "fa-solid fa-circle-check";
            icon.style.color = "var(--normal-color)";
        }
        if (statusText) {
            statusText.innerText = "กำหนดสเกลแล้ว";
            statusText.style.color = "var(--normal-color)";
        }
        if (descText) {
            descText.innerText = `1 unit = ${metersPerUnit.toFixed(2)} เมตร`;
        }
    } else {
        if (icon) {
            icon.className = "fa-solid fa-circle-xmark";
            icon.style.color = "var(--delete-color)";
        }
        if (statusText) {
            statusText.innerText = "ยังไม่ได้คาลิเบรต";
            statusText.style.color = "var(--text-muted)";
        }
        if (descText) {
            descText.innerText = "(สเกลเริ่มต้น 1.00 ม./หน่วย)";
        }
    }
}

function showCalibrationCard(showIntro) {
    if (showIntro) {
        document.getElementById('calib-step-1').style.display = 'block';
        document.getElementById('calib-step-2').style.display = 'none';
        document.getElementById('btn-save-calibration').disabled = true;
    } else {
        document.getElementById('calib-step-1').style.display = 'none';
        document.getElementById('calib-step-2').style.display = 'block';
        document.getElementById('btn-save-calibration').disabled = false;

        const p1 = calibrationPoints[0];
        const p2 = calibrationPoints[1];
        const mapDistance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

        document.getElementById('calib-start-coords').innerText = `(${p1.x.toFixed(1)}, ${p1.y.toFixed(1)})`;
        document.getElementById('calib-end-coords').innerText = `(${p2.x.toFixed(1)}, ${p2.y.toFixed(1)})`;
        document.getElementById('calib-map-dist').value = mapDistance.toFixed(2);

        const calibInput = document.getElementById('calib-real-dist');
        if (calibInput && !calibInput.value) {
            calibInput.value = (mapDistance * metersPerUnit).toFixed(1);
        }

        calculateAndDisplayMetersPerUnit();
    }
}

function handleCalibrationClick(x, y) {
    if (calibrationPoints.length >= 2) {
        resetCalibration();
    }

    calibrationPoints.push({ x, y });

    if (calibrationPoints.length === 1) {
        const pos = toLatLng(x, y);
        calibrationTempMarkerStart = L.marker(pos, {
            draggable: true,
            icon: L.divIcon({
                className: 'temp-calibration-marker',
                html: '<i class="fa-solid fa-flag" style="color: #d32f2f; font-size: 20px; text-shadow: 0 1px 3px rgba(0,0,0,0.3);"></i>',
                iconSize: [20, 20],
                iconAnchor: [5, 20]
            })
        }).addTo(map);

        calibrationTempMarkerStart.on('drag', () => {
            const newPos = calibrationTempMarkerStart.getLatLng();
            const coords = toXY(newPos);
            calibrationPoints[0] = { x: Math.max(0, Math.min(MAP_WIDTH, coords.x)), y: Math.max(0, Math.min(MAP_HEIGHT, coords.y)) };
            updateCalibrationLineAndCard();
        });

        showCalibrationCard(true);
    } else if (calibrationPoints.length === 2) {
        const p1 = calibrationPoints[0];
        const p2 = calibrationPoints[1];

        const pos2 = toLatLng(x, y);
        calibrationTempMarkerEnd = L.marker(pos2, {
            draggable: true,
            icon: L.divIcon({
                className: 'temp-calibration-marker',
                html: '<i class="fa-solid fa-flag-checkered" style="color: #2e7d32; font-size: 20px; text-shadow: 0 1px 3px rgba(0,0,0,0.3);"></i>',
                iconSize: [20, 20],
                iconAnchor: [5, 20]
            })
        }).addTo(map);

        calibrationTempMarkerEnd.on('drag', () => {
            const newPos = calibrationTempMarkerEnd.getLatLng();
            const coords = toXY(newPos);
            calibrationPoints[1] = { x: Math.max(0, Math.min(MAP_WIDTH, coords.x)), y: Math.max(0, Math.min(MAP_HEIGHT, coords.y)) };
            updateCalibrationLineAndCard();
        });

        calibrationTempLine = L.polyline([toLatLng(p1.x, p1.y), toLatLng(p2.x, p2.y)], {
            color: '#10b981',
            weight: 4,
            dashArray: '6, 8',
            opacity: 0.8
        }).addTo(map);

        showCalibrationCard(false);
    }
}

function updateCalibrationLineAndCard() {
    if (calibrationPoints.length === 2 && calibrationTempLine) {
        const p1 = calibrationPoints[0];
        const p2 = calibrationPoints[1];
        calibrationTempLine.setLatLngs([toLatLng(p1.x, p1.y), toLatLng(p2.x, p2.y)]);

        const mapDistance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        document.getElementById('calib-map-dist').value = mapDistance.toFixed(2);
        document.getElementById('calib-start-coords').innerText = `(${p1.x.toFixed(1)}, ${p1.y.toFixed(1)})`;
        document.getElementById('calib-end-coords').innerText = `(${p2.x.toFixed(1)}, ${p2.y.toFixed(1)})`;

        calculateAndDisplayMetersPerUnit();
    }
}

function calculateAndDisplayMetersPerUnit() {
    const mapDist = parseFloat(document.getElementById('calib-map-dist').value);
    const realDist = parseFloat(document.getElementById('calib-real-dist').value);
    const label = document.getElementById('calib-calculated-scale');

    if (mapDist > 0 && realDist > 0) {
        const calculatedScale = realDist / mapDist;
        if (label) label.innerText = calculatedScale.toFixed(3);
        document.getElementById('btn-save-calibration').disabled = false;
    } else {
        if (label) label.innerText = "N/A";
        document.getElementById('btn-save-calibration').disabled = true;
    }
}

function saveCalibration() {
    const mapDist = parseFloat(document.getElementById('calib-map-dist').value);
    const realDist = parseFloat(document.getElementById('calib-real-dist').value);

    if (mapDist > 0 && realDist > 0) {
        metersPerUnit = realDist / mapDist;
        isCalibrated = true;
        updateScaleBadge();
        resetCalibration();
        closeEditorCards();
        saveStateToHistory();
        autoSaveToLocalStorage();
        renderAllElements();
        alert(`ตั้งค่าสเกลสำเร็จ: 1 unit = ${metersPerUnit.toFixed(3)} เมตร`);
    }
}

function resetCalibration() {
    calibrationPoints = [];
    if (calibrationTempMarkerStart) { map.removeLayer(calibrationTempMarkerStart); calibrationTempMarkerStart = null; }
    if (calibrationTempMarkerEnd) { map.removeLayer(calibrationTempMarkerEnd); calibrationTempMarkerEnd = null; }
    if (calibrationTempLine) { map.removeLayer(calibrationTempLine); calibrationTempLine = null; }

    const realDistInput = document.getElementById('calib-real-dist');
    if (realDistInput) realDistInput.value = '';

    if (currentMode === 'calibrate') {
        showCalibrationCard(true);
    }
}

// ==========================================
// Set North Direction (กำหนดทิศเหนือ)
// ==========================================
function handleSetNorthClick(x, y) {
    northCompassPos = { x: x, y: y, floor: currentFloor };

    saveStateToHistory();
    autoSaveToLocalStorage();
    renderAllElements();

    document.getElementById('north-card').style.display = 'block';
    updateNorthUI();
}

function updateNorthUI() {
    const arrow = document.getElementById('north-card-arrow');
    const text = document.getElementById('north-angle-text');
    const input = document.getElementById('north-angle-input');

    if (arrow) arrow.style.transform = `rotate(${mapNorthAngle}deg)`;
    if (text) text.innerText = `${Math.round(mapNorthAngle)}°`;
    if (input) input.value = Math.round(mapNorthAngle);

    const needle = document.querySelector('.compass-needle');
    if (needle) {
        needle.style.transform = `rotate(${mapNorthAngle}deg)`;
    }
}

function updateNorthAngle(angle) {
    mapNorthAngle = (Math.round(angle) + 360) % 360;
    updateNorthUI();
}

function updateNorthAngleFromInput(val) {
    let angle = parseInt(val);
    if (isNaN(angle)) return;
    angle = (angle + 360) % 360;

    mapNorthAngle = angle;
    updateNorthUI();

    saveStateToHistory();
    autoSaveToLocalStorage();
}

function resetNorthAngle() {
    mapNorthAngle = 0;
    updateNorthUI();

    saveStateToHistory();
    autoSaveToLocalStorage();
}

function setupCompassDragEvents() {
    const ring = document.getElementById('map-compass-ring');
    if (!ring) return;

    let isDraggingAngle = false;

    function calculateAngle(e) {
        const rect = ring.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        const dx = clientX - centerX;
        const dy = clientY - centerY;

        let angleRad = Math.atan2(dy, dx);
        let angleDeg = angleRad * 180 / Math.PI;

        angleDeg = (angleDeg + 90 + 360) % 360;
        return angleDeg;
    }

    function handleStart(e) {
        if (currentMode !== 'setNorth') return;

        map.dragging.disable();

        isDraggingAngle = true;
        const angle = calculateAngle(e);
        updateNorthAngle(angle);

        e.preventDefault();
        e.stopPropagation();
    }

    function handleMove(e) {
        if (!isDraggingAngle) return;
        const angle = calculateAngle(e);
        updateNorthAngle(angle);

        e.preventDefault();
        e.stopPropagation();
    }

    function handleEnd(e) {
        if (isDraggingAngle) {
            isDraggingAngle = false;
            map.dragging.enable();
            saveStateToHistory();
            autoSaveToLocalStorage();
        }
    }

    ring.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    ring.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
}
