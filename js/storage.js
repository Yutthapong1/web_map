// ==========================================
// Web Map Editor - Storage & State Management
// ==========================================

let mapName = "แผนที่นำทางอาคารอัจฉริยะ";
let historyStack = [];
const maxHistory = 30;

function saveStateToHistory() {
    const state = {
        nodes: JSON.parse(JSON.stringify(customNodes)),
        edges: JSON.parse(JSON.stringify(customEdges)),
        metersPerUnit: metersPerUnit,
        mapNorthAngle: mapNorthAngle,
        northCompassPos: northCompassPos ? JSON.parse(JSON.stringify(northCompassPos)) : null,
        mapName: mapName
    };
    historyStack.push(state);
    if (historyStack.length > maxHistory) {
        historyStack.shift();
    }
}

function undoAction() {
    if (historyStack.length > 1) {
        historyStack.pop(); // เอา state ล่าสุดออก
        const prevState = historyStack[historyStack.length - 1];

        customNodes = JSON.parse(JSON.stringify(prevState.nodes));
        customEdges = JSON.parse(JSON.stringify(prevState.edges));
        metersPerUnit = prevState.metersPerUnit;
        mapNorthAngle = prevState.mapNorthAngle !== undefined ? prevState.mapNorthAngle : 0;
        northCompassPos = prevState.northCompassPos !== undefined ? prevState.northCompassPos : null;
        mapName = prevState.mapName !== undefined ? prevState.mapName : "แผนที่นำทางอาคารอัจฉริยะ";
        isCalibrated = metersPerUnit !== 1.0;

        const titleDisplay = document.getElementById('map-title-display');
        if (titleDisplay) {
            titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
        }

        renderAllElements();
        updateScaleBadge();
        autoSaveToLocalStorage();
    } else {
        alert('ถึงจุดเริ่มต้นแล้ว ไม่สามารถย้อนกลับได้อีก');
    }
}

function autoSaveToLocalStorage() {
    // ปิดระบบบันทึกอัตโนมัติเบื้องหลังตามคำขอของผู้ใช้งาน เพื่อป้องกันการเขียนทับโดยไม่ตั้งใจ
}

function saveMapToBrowser() {
    const exportData = {
        studio_version: "2.3-Pro-MultiFloor",
        mapName: mapName,
        metersPerUnit: metersPerUnit,
        floorImages: floorImages,
        nodes: customNodes,
        edges: customEdges,
        raw_edges: customEdges, // สำหรับรองรับการเปิดไฟล์แบคอัพตรงๆ
        mapNorthAngle: mapNorthAngle,
        northCompassPos: northCompassPos
    };
    try {
        localStorage.setItem('indoorMapAutoSave', JSON.stringify(exportData));
        return true;
    } catch (e) {
        console.warn('ไม่สามารถบันทึกรูปภาพแผนที่ลงใน Local Storage ได้เนื่องจากขนาดไฟล์เกินโควตาของบราวเซอร์ จะทำการบันทึกข้อมูลโหนดและเส้นเชื่อมแทน', e);
        try {
            const fallbackData = { ...exportData };
            delete fallbackData.floorImages;
            localStorage.setItem('indoorMapAutoSave', JSON.stringify(fallbackData));
            return true;
        } catch (err) {
            console.error('Failed to save fallback data', err);
            return false;
        }
    }
}

// ระบบตั้งชื่อและบันทึกข้อมูลลงบราวเซอร์แบบแมนนวล
function openSaveLocalModal() {
    closeEditorCards();
    document.getElementById('save-local-modal').style.display = 'flex';
    document.getElementById('save-local-map-name').value = mapName;
}

function closeSaveLocalModal() {
    document.getElementById('save-local-modal').style.display = 'none';
}

function confirmSaveLocal() {
    const inputMapName = document.getElementById('save-local-map-name').value.trim();
    
    if (!inputMapName) {
        alert("กรุณาระบุชื่อแผนที่อาคาร");
        return;
    }
    
    mapName = inputMapName;
    const titleDisplay = document.getElementById('map-title-display');
    if (titleDisplay) {
        titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
    }
    
    const success = saveMapToBrowser();
    closeSaveLocalModal();
    
    if (success) {
        alert(`💾 บันทึกแผนที่อาคาร "${mapName}" ลงในเบราว์เซอร์สำเร็จเรียบร้อยแล้วครับ!`);
    } else {
        alert("❌ เกิดข้อผิดพลาด ไม่สามารถบันทึกข้อมูลลงในเบราว์เซอร์ได้");
    }
}

function loadFromAutoSave() {
    const saved = localStorage.getItem('indoorMapAutoSave');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            customNodes = data.nodes || {};
            customEdges = data.edges || data.raw_edges || [];
            metersPerUnit = data.metersPerUnit || 1.0;
            mapNorthAngle = data.mapNorthAngle !== undefined ? data.mapNorthAngle : 0;
            northCompassPos = data.northCompassPos !== undefined ? data.northCompassPos : null;
            mapName = data.mapName !== undefined ? data.mapName : "แผนที่นำทางอาคารอัจฉริยะ";

            const titleDisplay = document.getElementById('map-title-display');
            if (titleDisplay) {
                titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
            }

            // กู้คืนรูปภาพและรายชื่อชั้นจาก Auto-Save
            if (data.floorImages && Object.keys(data.floorImages).length > 0) {
                floorImages = {};
                Object.keys(data.floorImages).forEach(key => {
                    floorImages[parseInt(key)] = data.floorImages[key];
                });
            } else {
                // กู้คืนรายชื่อชั้นจากข้อมูล Auto-Save โหนดจริง (กรณี fallback หรือไม่เคยมีภาพ)
                const uniqueFloors = new Set(Object.values(customNodes).map(n => n.floor));
                if (uniqueFloors.size > 0) {
                    floorImages = {};
                    uniqueFloors.forEach(f => {
                        floorImages[f] = '';
                    });
                } else {
                    floorImages = { 1: '' };
                }
            }
            
            renderFloorButtons();
            renderFloorUploadForms();

            document.getElementById('startup-overlay').style.display = 'none';
            isCalibrated = metersPerUnit !== 1.0;
            updateScaleBadge();

            historyStack = [];
            saveStateToHistory();

            const floorsList = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
            const initialFloor = floorsList.length > 0 ? floorsList[0] : 1;
            switchFloor(initialFloor);
            renderAllElements();
        } catch (e) {
            console.error('Error parsing autosave', e);
        }
    } else {
        alert('ไม่พบข้อมูล Auto-Save ในเครื่องของคุณ');
    }
}

// นำเข้า JSON
function importFromJsonFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);

            let parsedNodes = null;
            let parsedEdges = [];

            // ตรวจสอบว่าเป็นไฟล์แบคอัพเต็มรูปแบบ (Full Export) หรือไฟล์พิกัดโหนดอย่างเดียว
            if (importedData.nodes !== undefined) {
                parsedNodes = importedData.nodes;
                parsedEdges = importedData.raw_edges || importedData.edges || [];
            } else if (Object.keys(importedData).length > 0 && typeof importedData[Object.keys(importedData)[0]] === 'object' && importedData[Object.keys(importedData)[0]].x !== undefined) {
                // กรณีที่เป็นไฟล์พิกัดล้วน (Legacy nodes_data.json)
                parsedNodes = importedData;
            }

            if (parsedNodes) {
                customNodes = parsedNodes;
                customEdges = parsedEdges;

                if (importedData.metersPerUnit !== undefined) {
                    metersPerUnit = parseFloat(importedData.metersPerUnit) || 1.0;
                    isCalibrated = true;
                    updateScaleBadge();
                }

                if (importedData.floorImages && Object.keys(importedData.floorImages).length > 0) {
                    floorImages = {};
                    Object.keys(importedData.floorImages).forEach(key => {
                        floorImages[parseInt(key)] = importedData.floorImages[key];
                    });
                } else {
                    // หากไม่มีข้อมูลภาพชั้น ให้ล้างข้อมูลเดิมและสร้างโครงชั้นตามโหนดที่นำเข้าเพื่อความสะอาด
                    const uniqueFloors = new Set(Object.values(customNodes).map(n => n.floor));
                    floorImages = {};
                    if (uniqueFloors.size > 0) {
                        uniqueFloors.forEach(f => {
                            floorImages[f] = '';
                        });
                    } else {
                        floorImages = { 1: '' };
                    }
                }

                if (importedData.mapName !== undefined) {
                    mapName = importedData.mapName;
                } else {
                    mapName = "แผนที่นำทางอาคารอัจฉริยะ";
                }

                const titleDisplay = document.getElementById('map-title-display');
                if (titleDisplay) {
                    titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
                }

                renderFloorButtons();
                renderFloorUploadForms();

                if (importedData.mapNorthAngle !== undefined) {
                    mapNorthAngle = parseFloat(importedData.mapNorthAngle) || 0;
                } else {
                    mapNorthAngle = 0;
                }

                if (importedData.northCompassPos !== undefined) {
                    northCompassPos = importedData.northCompassPos;
                } else {
                    northCompassPos = null;
                }

                Object.keys(customNodes).forEach(id => {
                    if (customNodes[id].floor === undefined) {
                        customNodes[id].floor = 1;
                    }
                });

                closeEditorCards();

                document.getElementById('startup-overlay').style.display = 'none';

                historyStack = [];
                saveStateToHistory();
                autoSaveToLocalStorage();

                const floorsList = Object.keys(floorImages).map(Number).sort((a, b) => a - b);
                const initialFloor = floorsList.length > 0 ? floorsList[0] : 1;
                switchFloor(initialFloor);
                alert("🎉 นำเข้าข้อมูลสำเร็จรวดเดียว!\n\nโหลดข้อมูลรูปภาพแผนที่ (Base64), ตำแหน่งหมุด, การเชื่อมโยงข้ามชั้น, สเกล และทิศเหนือ กลับมาสมบูรณ์ครบถ้วนในไฟล์เดียวครับ");
            } else {
                alert("⚠️ รูปแบบไฟล์ JSON ไม่ถูกต้อง");
            }
        } catch (err) {
            alert("❌ ไม่สามารถอ่านไฟล์ JSON นี้ได้: " + err);
        }
    };
    reader.readAsText(file);

    event.target.value = '';
}

// ระบบตั้งชื่อแผนที่สไตล์ Apple ก่อนส่งออก
function openExportModal() {
    closeEditorCards();
    document.getElementById('export-modal').style.display = 'flex';
    document.getElementById('export-map-name').value = mapName;
    
    // ทำความสะอาดชื่อไฟล์อัตโนมัติ
    const sanitized = mapName.replace(/[^a-zA-Z0-9ก-๙\s-_]/g, '').trim().replace(/\s+/g, '_');
    document.getElementById('export-file-name').value = sanitized || "indoor_map_data";
}

function closeExportModal() {
    document.getElementById('export-modal').style.display = 'none';
}

function confirmExport() {
    const inputMapName = document.getElementById('export-map-name').value.trim();
    const inputFileName = document.getElementById('export-file-name').value.trim();
    
    if (!inputMapName) {
        alert("กรุณาระบุชื่อแผนที่อาคาร");
        return;
    }
    if (!inputFileName) {
        alert("กรุณาระบุชื่อไฟล์สำหรับดาวน์โหลด");
        return;
    }
    
    mapName = inputMapName;
    const titleDisplay = document.getElementById('map-title-display');
    if (titleDisplay) {
        titleDisplay.innerText = `ชื่อแผนที่: ${mapName}`;
    }

    // บันทึกสถานะชื่อแผนที่ลงประวัติและ Local Storage ทันที
    saveStateToHistory();
    autoSaveToLocalStorage();
    
    closeExportModal();
    executeExport(inputFileName);
}

// ทำการดาวน์โหลดและส่งออกไฟล์จริง
function executeExport(filename) {
    let edgeMap = {};
    Object.keys(customNodes).forEach(id => edgeMap[id] = []);
    customEdges.forEach(edge => {
        if (edgeMap[edge.fromId]) edgeMap[edge.fromId].push(edge.toId);
        if (edgeMap[edge.toId]) edgeMap[edge.toId].push(edge.fromId);
    });

    const exportData = {
        studio_version: "2.3-Pro-MultiFloor",
        export_time: new Date().toISOString(),
        mapName: mapName,
        metersPerUnit: metersPerUnit,
        floorImages: floorImages,
        nodes: customNodes,
        edges_adjacency_list: edgeMap,
        edges: customEdges, // เพิ่มคีย์ edges เพื่อความยืดหยุ่นและการทำงานร่วมกันสมบูรณ์แบบ
        raw_edges: customEdges, // สำหรับ Dart/Flutter แอปในมือถือตรงๆ
        mapNorthAngle: mapNorthAngle,
        northCompassPos: northCompassPos
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `${filename}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);

    alert(`💾 บันทึกและส่งออกแผนที่สำเร็จ!\n\nแผนที่ "${mapName}" ได้รับการบันทึกในไฟล์ "${filename}.json" และดาวน์โหลดเรียบร้อยแล้วครับ`);
}
