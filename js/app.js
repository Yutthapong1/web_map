// ==========================================
// Web Map Editor - Main Orchestrator & UI Core
// ==========================================

const MAP_HEIGHT = 50;
const MAP_WIDTH = 100;

// รูปตารางพิมพ์เขียวสีเข้มแบบออฟไลน์สำเร็จรูป เมื่อยังไม่ได้ใส่รูปภาพพื้นหลัง
const fallbackBlueprint = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="0 0 1000 500"><rect width="1000" height="500" fill="%2309090b"/><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="%2327272a" stroke-width="1"/><path d="M 100 0 L 0 0 0 100" fill="none" stroke="%233f3f46" stroke-width="1.5"/></pattern></defs><rect width="1000" height="500" fill="url(%23grid)"/><text x="500" y="250" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif" font-size="18" fill="%2371717a" text-anchor="middle" font-weight="bold">สตูดิโอแผนที่เปล่า - กรุณาอัปโหลดรูปแผนที่ในเมนูด้านซ้าย</text></svg>`;

let customNodes = {};
let customEdges = [];
let currentMode = 'addAndDrag';
let selectedNodeForEdge = null;
let myLocationNodeId = null;

// ดาต้าเบสระบบ 3 ชั้นเริ่มต้น
let currentFloor = 1;
let floorImages = {
    1: '',
    2: '',
    3: ''
};

// ตั้งค่า Leaflet Map
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 3,
    maxZoom: 7,
    attributionControl: false
});

const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
L.imageOverlay(floorImages[1] || fallbackBlueprint, bounds).addTo(map);
map.setView([MAP_HEIGHT / 2, MAP_WIDTH / 2], 3);

function setMode(mode) {
    currentMode = mode;
    selectedNodeForEdge = null;

    if (mode !== 'routing') {
        clearRouting();
    }

    closeEditorCards();

    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const activeChip = document.querySelector(`.chip[data-mode="${mode}"]`);
    if (activeChip) activeChip.classList.add('active');

    if (mode === 'calibrate') {
        const calibCard = document.getElementById('calibration-card');
        if (calibCard) calibCard.style.display = 'block';
        showCalibrationCard(true);
    } else if (mode === 'setNorth') {
        const northCard = document.getElementById('north-card');
        if (northCard) northCard.style.display = 'block';
        updateNorthUI();
    }

    renderAllElements();
}

// สลับชั้น
function switchFloor(floorNum) {
    currentFloor = parseInt(floorNum);

    // อัปเดตคลาส active
    document.querySelectorAll('.floor-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`floor-btn-${floorNum}`);
    if (activeBtn) activeBtn.classList.add('active');

    // อัปเดตสีปุ่มเพื่อความสวยงาม
    document.querySelectorAll('.floor-btn').forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.style.background = 'var(--primary-glow)';
            btn.style.color = 'var(--primary)';
            btn.style.borderColor = 'var(--primary)';
        } else {
            btn.style.background = '#202024';
            btn.style.color = 'var(--text-main)';
            btn.style.borderColor = 'var(--border-color)';
        }
    });

    // อัปเดตตัวบ่งชี้ชั้นด้านบน
    const floorIndicator = document.getElementById('current-floor-indicator');
    if (floorIndicator) {
        floorIndicator.innerText = `ชั้น ${floorNum}`;
    }

    // สลับรูปภาพ Overlay แผนที่
    let imageSource = floorImages[currentFloor] || fallbackBlueprint;
    map.eachLayer(layer => {
        if (layer instanceof L.ImageOverlay) {
            map.removeLayer(layer);
        }
    });
    L.imageOverlay(imageSource, bounds).addTo(map);

    clearRouting();
    closeEditorCards();
    renderAllElements();
}

function openFloorSettings() {
    closeEditorCards();
    renderFloorUploadForms();
    document.getElementById('floor-settings-card').style.display = 'block';

    // อัปเดตสถานะป้ายกำกับ
    Object.keys(floorImages).forEach(i => {
        const statusEl = document.getElementById(`status-img-${i}`);
        if (statusEl) {
            if (floorImages[i]) {
                statusEl.innerText = "(กำหนดภาพแล้ว - Base64)";
                statusEl.style.color = "var(--normal-color)";
            } else {
                statusEl.innerText = "(ตารางพิมพ์เขียวเริ่มต้น)";
                statusEl.style.color = "var(--text-muted)";
            }
        }
    });
}

// จัดการอัปโหลดไฟล์ภาพ
function handleFloorImageUpload(event, floorNum) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        floorImages[floorNum] = e.target.result;
        
        const statusEl = document.getElementById(`status-img-${floorNum}`);
        if (statusEl) {
            statusEl.innerText = "(กำหนดเอง - Base64)";
            statusEl.style.color = "#10b981";
        }

        // หากกำลังเลือกชั้นนั้นอยู่ ให้โหลดแสดงภาพทันที
        if (currentFloor === floorNum) {
            switchFloor(floorNum);
        }

        // บันทึกสถานะลงในประวัติและ Local Storage ทันทีเมื่อรูปภาพชั้นเปลี่ยน
        saveStateToHistory();
        autoSaveToLocalStorage();
    };
    reader.readAsDataURL(file);
}

// ฟังก์ชันล้างและสร้างแผนที่ใหม่จากศูนย์ (เรียกเปิดคอนฟิกชั้น)
function startFreshMap() {
    document.getElementById('fresh-map-modal').style.display = 'flex';
}

// คอนเฟิร์มการสร้างแผนที่ใหม่พร้อมระบุชั้นที่ต้องการ
function confirmFreshMapCreation() {
    let floorsInput = document.getElementById('fresh-floors-input').value;
    let newMapName = document.getElementById('fresh-map-name-input').value.trim();
    
    let parsedFloors = floorsInput.split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);
    
    if (parsedFloors.length === 0) {
        alert("กรุณาระบุเลขชั้นที่ถูกต้อง อย่างน้อย 1 ชั้น");
        return;
    }

    if (!newMapName) {
        alert("กรุณาระบุชื่อแผนที่อาคารใหม่");
        return;
    }

    if (!confirm("คุณต้องการล้างแผนที่เดิมและเริ่มสร้างแผนที่ใหม่จากศูนย์ใช่หรือไม่?\nข้อมูลทั้งหมดรวมถึงรูปภาพแผนที่จะสูญหายและไม่สามารถกู้คืนได้")) {
        return;
    }

    customNodes = {};
    customEdges = [];
    floorImages = {};
    parsedFloors.forEach(f => {
        floorImages[f] = '';
    });
    metersPerUnit = 1.0;
    isCalibrated = false;
    myLocationNodeId = null;
    routingStartNodeId = null;
    routingEndNodeId = null;
    selectedNodeForEdge = null;
    mapNorthAngle = 0;
    northCompassPos = null;
    mapName = newMapName;

    const titleDisplay = document.getElementById('map-title-display');
    if (titleDisplay) {
        titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
    }

    if (northCompassMarker) {
        map.removeLayer(northCompassMarker);
        northCompassMarker = null;
    }

    // ลบ Markers และ Polylines เดิมออกจากแผนที่
    Object.values(markersMap).forEach(m => map.removeLayer(m));
    polylinesArray.forEach(p => map.removeLayer(p));
    markersMap = {};
    polylinesArray = [];

    // อัปเดต UI ต่างๆ
    updateScaleBadge();
    document.getElementById('json-file-input').value = '';
    document.getElementById('startup-overlay').style.display = 'none';
    document.getElementById('fresh-map-modal').style.display = 'none';

    // สลับกลับมายังชั้นแรกที่มีในรายการแบบไดนามิก
    currentFloor = parsedFloors[0];
    
    renderFloorButtons();
    renderFloorUploadForms();
    switchFloor(currentFloor);

    historyStack = [];
    saveStateToHistory();
    autoSaveToLocalStorage();

    // เปิดเมนูอัปโหลดภาพแผนที่ทันทีเพื่อเริ่มสร้าง (UX Guidance)
    openFloorSettings();
}

function deleteEdgeByIndex(index) {
    customEdges.splice(index, 1);
    saveStateToHistory();
    autoSaveToLocalStorage();
    renderAllElements();
}

// วาดปุ่มเลือกชั้นแบบไดนามิก
function renderFloorButtons() {
    const container = document.getElementById('floor-buttons-container');
    if (!container) return;

    let html = '';
    const sortedFloors = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
    sortedFloors.forEach(floor => {
        const isActive = floor === currentFloor ? 'active' : '';
        const isOnlyFloor = sortedFloors.length <= 1;
        const deleteBtnHtml = isOnlyFloor ? '' : `
            <button onclick="event.stopPropagation(); deleteFloor(${floor})" class="btn-delete-floor" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 8px; padding: 10px; width: 38px; height: 38px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-sizing: border-box;" onmouseover="this.style.background='#ef4444'; this.style.color='white'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.color='#ef4444'" title="ลบชั้น ${floor}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        html += `
            <div class="floor-btn-row" style="display: flex; gap: 8px; align-items: center; width: 100%;">
                <button class="floor-btn ${isActive}" onclick="switchFloor(${floor})" id="floor-btn-${floor}" style="flex: 1; margin: 0;">ชั้น ${floor} (Floor ${floor})</button>
                ${deleteBtnHtml}
            </div>
        `;
    });
    container.innerHTML = html;

    // อัปเดตสีปุ่มชั้น
    document.querySelectorAll('.floor-btn').forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.style.background = 'var(--primary-glow)';
            btn.style.color = 'var(--primary)';
            btn.style.borderColor = 'var(--primary)';
        } else {
            btn.style.background = '#202024';
            btn.style.color = 'var(--text-main)';
            btn.style.borderColor = 'var(--border-color)';
        }
    });
}

// ฟังก์ชันวาดฟอร์มอัปโหลดรูปภาพแยกชั้นแบบไดนามิก พร้อมปุ่มลบชั้น
function renderFloorUploadForms() {
    const container = document.getElementById('floor-upload-forms-container');
    if (!container) return;

    let html = '';
    const sortedFloors = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
    sortedFloors.forEach(floor => {
        const isCustom = floorImages[floor] && floorImages[floor] !== '';
        const statusText = isCustom ? '(กำหนดภาพแล้ว - Base64)' : '(ตารางพิมพ์เขียวเริ่มต้น)';
        const statusColor = isCustom ? 'var(--normal-color)' : 'var(--text-muted)';
        
        html += `
            <div class="form-group" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 10px;">
                <label style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">
                    <span>รูปแผนที่ชั้น ${floor}</span>
                    <span id="status-img-${floor}" style="color: ${statusColor}; font-size: 10px;">${statusText}</span>
                </label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="file" id="upload-floor-${floor}" accept="image/*" class="form-control" onchange="handleFloorImageUpload(event, ${floor})" style="flex: 1;">
                    <button onclick="deleteFloor(${floor})" class="btn" style="background-color: var(--delete-color); color: white; border: none; border-radius: 6px; padding: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='var(--delete-color)'" title="ลบชั้นนี้">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ฟังก์ชันลบชั้นออกจาระบบนำทางอย่างปลอดภัย
function deleteFloor(floorNum) {
    const floorCount = Object.keys(floorImages).length;
    if (floorCount <= 1) {
        alert("⚠️ ไม่สามารถลบได้: แผนที่อาคารจำเป็นต้องมีอย่างน้อย 1 ชั้นครับ");
        return;
    }

    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบ "ชั้น ${floorNum}"?\n\nการลบชั้นนี้จะลบรูปแผนที่ รวมถึงโหนดและเส้นเชื่อมทั้งหมดที่อยู่บนชั้น ${floorNum} ออกด้วยถาวรและไม่สามารถกู้คืนได้!`)) {
        return;
    }

    // 1. ลบโหนดทั้งหมดที่อยู่บนชั้นนี้
    Object.keys(customNodes).forEach(id => {
        if (customNodes[id].floor === floorNum) {
            delete customNodes[id];
        }
    });

    // 2. ลบเส้นเชื่อมทั้งหมดที่ชี้ไปยังโหนดที่ถูกลบไป
    customEdges = customEdges.filter(edge => {
        const fromNode = customNodes[edge.fromId];
        const toNode = customNodes[edge.toId];
        return fromNode && toNode; 
    });

    // 3. ลบชั้นออกจากฐานข้อมูลภาพ
    delete floorImages[floorNum];

    // 4. หากชั้นที่โดนลบเป็นชั้นปัจจุบัน ให้สลับไปชั้นแรกที่เหลืออยู่แทนเพื่อกันจอดำ
    if (currentFloor === floorNum) {
        const remainingFloors = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
        currentFloor = remainingFloors[0];
    }

    // 5. สั่งเรนเดอร์ UI สลับแผนที่สลับฟอร์มใหม่ทั้งหมด
    renderFloorButtons();
    renderFloorUploadForms();
    switchFloor(currentFloor);

    saveStateToHistory();
    autoSaveToLocalStorage();
    
    openFloorSettings();
}

// ฟังก์ชันเพิ่มชั้นใหม่เข้าสู่ระบบนำทาง
function addNewFloor() {
    const sortedFloors = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
    let nextFloor = 1;
    if (sortedFloors.length > 0) {
        nextFloor = sortedFloors[sortedFloors.length - 1] + 1; 
    }
    
    const floorStr = prompt("ระบุหมายเลขชั้นใหม่ที่ต้องการเพิ่ม (ระบุตัวเลข เช่น 4 หรือ 5):", nextFloor);
    if (floorStr === null) return; 
    
    const newFloorNum = parseInt(floorStr.trim());
    if (isNaN(newFloorNum)) {
        alert("⚠️ กรุณาระบุหมายเลขชั้นเป็นตัวเลขที่ถูกต้อง");
        return;
    }
    
    if (floorImages[newFloorNum] !== undefined) {
        alert(`⚠️ ชั้น ${newFloorNum} มีอยู่ในระบบเรียบร้อยแล้วครับ`);
        return;
    }
    
    floorImages[newFloorNum] = ''; 
    
    renderFloorButtons();
    renderFloorUploadForms();
    switchFloor(newFloorNum);
    
    saveStateToHistory();
    autoSaveToLocalStorage();
    
    openFloorSettings();
}

// ดักจับคลิกแผนที่เพื่อสร้างโหนดหรือธง Calibration
map.on('click', (e) => {
    const coords = toXY(e.latlng);
    if (coords.x < 0 || coords.x > MAP_WIDTH || coords.y < 0 || coords.y > MAP_HEIGHT) return;

    if (currentMode === 'addAndDrag') {
        openCreateCard(coords.x, coords.y);
    } else if (currentMode === 'calibrate') {
        handleCalibrationClick(coords.x, coords.y);
    } else if (currentMode === 'setNorth') {
        handleSetNorthClick(coords.x, coords.y);
    } else if (currentMode === 'quickPath') {
        if (selectedNodeForEdge) {
            const newId = `wp_${Date.now()}`;
            customNodes[newId] = {
                id: newId,
                name: 'จุดเลี้ยว',
                x: coords.x,
                y: coords.y,
                type: 'waypoint',
                floor: currentFloor,
                beaconMajor: null,
                beaconMinor: null
            };
            customEdges.push({ fromId: selectedNodeForEdge, toId: newId });
            selectedNodeForEdge = newId;
            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        } else {
            alert('📌 กรุณาคลิกเลือกจุดเริ่มต้น (โหนดห้องหรือจุดอื่นๆ) ก่อนที่จะลากวาดเส้นทางด่วนครับ');
        }
    }
});

function closeEditorCards() {
    const createCard = document.getElementById('create-node-card');
    const editCard = document.getElementById('edit-node-card');
    const calibCard = document.getElementById('calibration-card');
    const floorCard = document.getElementById('floor-settings-card');
    const btCard = document.getElementById('bt-configurator-card');
    const northCard = document.getElementById('north-card');
    const exportCard = document.getElementById('export-modal');
    const saveLocalCard = document.getElementById('save-local-modal');

    if (createCard) createCard.style.display = 'none';
    if (editCard) editCard.style.display = 'none';
    if (calibCard) calibCard.style.display = 'none';
    if (floorCard) floorCard.style.display = 'none';
    if (btCard) btCard.style.display = 'none';
    if (northCard) northCard.style.display = 'none';
    if (exportCard) exportCard.style.display = 'none';
    if (saveLocalCard) saveLocalCard.style.display = 'none';

    if (currentMode !== 'calibrate') {
        resetCalibration();
    }
}

function openCreateCard(x, y) {
    closeEditorCards();

    let maxMinor = 0;
    Object.values(customNodes).forEach(node => {
        if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
            maxMinor = node.beaconMinor;
        }
    });
    let nextMinor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);

    document.getElementById('new-node-name').value = `Node_${Object.keys(customNodes).length + 1}`;
    document.getElementById('new-node-type').value = 'normal';
    document.getElementById('new-node-major').value = currentFloor; 
    document.getElementById('new-node-minor').value = nextMinor;
    document.getElementById('new-node-mac').value = '';
    document.getElementById('new-node-x').value = x;
    document.getElementById('new-node-y').value = y;
    document.getElementById('create-node-card').style.display = 'block';
    document.getElementById('new-node-name').focus();
}

function saveNewNode() {
    const name = document.getElementById('new-node-name').value.trim();
    const type = document.getElementById('new-node-type').value;
    const x = parseFloat(document.getElementById('new-node-x').value);
    const y = parseFloat(document.getElementById('new-node-y').value);
    const major = document.getElementById('new-node-major').value;
    const minor = document.getElementById('new-node-minor').value;

    if (!name) return;

    const newId = `node_${Date.now()}`;
    customNodes[newId] = {
        id: newId,
        name: name,
        x: x,
        y: y,
        type: type,
        floor: currentFloor, 
        beaconMajor: major !== "" ? parseInt(major) : null,
        beaconMinor: minor !== "" ? parseInt(minor) : null,
        macAddress: document.getElementById('new-node-mac').value.trim() !== "" ? document.getElementById('new-node-mac').value.trim() : null
    };
    closeEditorCards();
    saveStateToHistory();
    autoSaveToLocalStorage();
    renderAllElements();
}

function toggleInterFloorSelect(nodeType) {
    const interFloorGroup = document.getElementById('edit-interfloor-group');
    const selectEl = document.getElementById('edit-node-interfloor');

    if (nodeType === 'stairs' || nodeType === 'elevator') {
        interFloorGroup.style.display = 'block';

        selectEl.innerHTML = '<option value="">-- ไม่เชื่อมโยงข้ามชั้น --</option>';
        const editNodeId = document.getElementById('edit-node-id').value;

        Object.values(customNodes).forEach(n => {
            if (n.id !== editNodeId && n.floor !== currentFloor && (n.type === 'stairs' || n.type === 'elevator')) {
                const opt = document.createElement('option');
                opt.value = n.id;
                opt.innerText = `${n.name} (ชั้น ${n.floor} - ${n.type === 'stairs' ? 'บันได' : 'ลิฟต์'})`;

                const alreadyConnected = customEdges.some(edge =>
                    (edge.fromId === editNodeId && edge.toId === n.id) ||
                    (edge.fromId === n.id && edge.toId === editNodeId)
                );
                if (alreadyConnected) {
                    opt.selected = true;
                }

                selectEl.appendChild(opt);
            }
        });
    } else {
        interFloorGroup.style.display = 'none';
    }
}

function openEditCard(node) {
    closeEditorCards();
    document.getElementById('edit-node-id').value = node.id;
    document.getElementById('edit-node-name').value = node.name;
    document.getElementById('edit-node-type').value = node.type;
    document.getElementById('edit-node-major').value = node.beaconMajor !== null ? node.beaconMajor : '';
    document.getElementById('edit-node-minor').value = node.beaconMinor !== null ? node.beaconMinor : '';
    document.getElementById('edit-node-mac').value = node.macAddress !== undefined && node.macAddress !== null ? node.macAddress : '';
    document.getElementById('edit-node-x').value = node.x;
    document.getElementById('edit-node-y').value = node.y;
    document.getElementById('edit-node-card').style.display = 'block';

    toggleInterFloorSelect(node.type);
}

function updateNodeDetails() {
    const id = document.getElementById('edit-node-id').value;
    const name = document.getElementById('edit-node-name').value.trim();
    const type = document.getElementById('edit-node-type').value;
    const major = document.getElementById('edit-node-major').value;
    const minor = document.getElementById('edit-node-minor').value;
    const x = parseFloat(document.getElementById('edit-node-x').value);
    const y = parseFloat(document.getElementById('edit-node-y').value);

    const targetInterFloorId = document.getElementById('edit-node-interfloor').value;

    if (!name || isNaN(x) || isNaN(y)) return;

    if (customNodes[id]) {
        customNodes[id].name = name;
        customNodes[id].type = type;
        customNodes[id].beaconMajor = major !== "" ? parseInt(major) : null;
        customNodes[id].beaconMinor = minor !== "" ? parseInt(minor) : null;
        const macAddress = document.getElementById('edit-node-mac').value.trim();
        customNodes[id].macAddress = macAddress !== "" ? macAddress : null;
        customNodes[id].x = Math.max(0, Math.min(MAP_WIDTH, x));
        customNodes[id].y = Math.max(0, Math.min(MAP_HEIGHT, y));

        if (type === 'stairs' || type === 'elevator') {
            customEdges = customEdges.filter(edge => {
                const fromNode = customNodes[edge.fromId];
                const toNode = customNodes[edge.toId];
                if (!fromNode || !toNode) return true;

                const involvesThisNode = (edge.fromId === id || edge.toId === id);
                const isInterFloor = (fromNode.floor !== toNode.floor);
                return !(involvesThisNode && isInterFloor);
            });

            if (targetInterFloorId) {
                customEdges.push({ fromId: id, toId: targetInterFloorId });
            }
        }
    }
    closeEditorCards();
    saveStateToHistory();
    autoSaveToLocalStorage();
    renderAllElements();
}

function handleNodeClick(node) {
    if (currentMode === 'delete') {
        delete customNodes[node.id];
        customEdges = customEdges.filter(e => e.fromId !== node.id && e.toId !== node.id);
        if (selectedNodeForEdge === node.id) selectedNodeForEdge = null;
        if (myLocationNodeId === node.id) myLocationNodeId = null;
        if (routingStartNodeId === node.id) routingStartNodeId = null;
        if (routingEndNodeId === node.id) routingEndNodeId = null;
        closeEditorCards();
        saveStateToHistory();
        autoSaveToLocalStorage();
        renderAllElements();
        return;
    }

    if (currentMode === 'connectLines' || currentMode === 'quickPath') {
        if (selectedNodeForEdge === null) {
            selectedNodeForEdge = node.id;
            renderAllElements();
        } else {
            if (selectedNodeForEdge === node.id) {
                selectedNodeForEdge = null;
                renderAllElements();
                return;
            }

            const edgeExists = customEdges.some(e =>
                (e.fromId === selectedNodeForEdge && e.toId === node.id) ||
                (e.fromId === node.id && e.toId === selectedNodeForEdge)
            );

            if (!edgeExists) {
                customEdges.push({ fromId: selectedNodeForEdge, toId: node.id });
            }

            selectedNodeForEdge = node.id;
            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        }
        return;
    }

    if (currentMode === 'calibrate') {
        handleCalibrationClick(node.x, node.y);
        return;
    }

    if (currentMode === 'routing') {
        if (!routingStartNodeId) {
            routingStartNodeId = node.id;
            renderAllElements();
        } else if (!routingEndNodeId) {
            if (routingStartNodeId === node.id) {
                routingStartNodeId = null;
            } else {
                routingEndNodeId = node.id;
            }
            renderAllElements();
        } else {
            routingStartNodeId = node.id;
            routingEndNodeId = null;
            renderAllElements();
        }
        return;
    }

    if (currentMode === 'addAndDrag') {
        openEditCard(node);
    }
}

// บูตการแสดงผลเมื่อหน้าเว็บพร้อม
renderFloorButtons();
renderFloorUploadForms();
updateScaleBadge();
renderAllElements();
