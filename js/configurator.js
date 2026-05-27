// ==========================================
// Web Map Editor - BLE (Bluetooth) & Serial (USB) Configurator
// ==========================================

let bluetoothDevice = null;
let configCharacteristic = null;
let currentEditingNodeIdForBT = null;

function openBluetoothConfigurator() {
    currentEditingNodeIdForBT = null;
    closeEditorCards();
    if (typeof disconnectBluetooth === 'function') disconnectBluetooth();
    document.getElementById('bt-configurator-card').style.display = 'block';
}

function generateMajorMinorForEdit() {
    let maxMinor = 0;
    Object.values(customNodes).forEach(node => {
        if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
            maxMinor = node.beaconMinor;
        }
    });
    let nextMinor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);
    document.getElementById('edit-node-major').value = currentFloor;
    document.getElementById('edit-node-minor').value = nextMinor;
}

async function quickSyncBT() {
    const btn = document.getElementById('btn-quick-sync-bt');
    const originalText = btn.innerHTML;

    try {
        let major = document.getElementById('edit-node-major').value;
        let minor = document.getElementById('edit-node-minor').value;

        if (!major || !minor) {
            let maxMinor = 0;
            Object.values(customNodes).forEach(node => {
                if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
                    maxMinor = node.beaconMinor;
                }
            });
            minor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);
            major = currentFloor;

            document.getElementById('edit-node-major').value = major;
            document.getElementById('edit-node-minor').value = minor;
        }

        btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> สแกน...";
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Indoor-Beacon' }],
            optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
        });

        btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> กำลังเชื่อมต่อ...";
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');

        if (device.name) {
            document.getElementById('edit-node-mac').value = device.name;
        }

        btn.innerHTML = "<i class='fa-solid fa-floppy-disk'></i> กำลังบันทึก...";
        updateNodeDetails(); 

        const cmd = `S:${major},${minor}`;
        const encoder = new TextEncoder('utf-8');
        const data = encoder.encode(cmd);

        if (characteristic.writeValueWithResponse) {
            await characteristic.writeValueWithResponse(data);
        } else if (characteristic.writeValueWithoutResponse) {
            await characteristic.writeValueWithoutResponse(data);
        } else {
            await characteristic.writeValue(data);
        }

        device.gatt.disconnect();
        alert(`✅ ซิงค์บลูทูธสำเร็จ!\n\nบอร์ด ESP32 ได้รับพิกัด M=${major}, N=${minor}\nและชื่อบอร์ด "${device.name}" ถูกบันทึกลงในโหนดแล้ว`);

    } catch (error) {
        console.error(error);
        if (error.name !== 'NotFoundError') {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อบลูทูธ: " + error.message);
        }
    } finally {
        btn.innerHTML = originalText;
    }
}

async function quickSyncUSB() {
    const btn = document.getElementById('btn-quick-sync-usb');
    const originalText = btn.innerHTML;

    try {
        let major = document.getElementById('edit-node-major').value;
        let minor = document.getElementById('edit-node-minor').value;
        let mac = document.getElementById('edit-node-mac').value.trim();
        let name = document.getElementById('edit-node-name').value;

        if (!major || !minor) {
            let maxMinor = 0;
            Object.values(customNodes).forEach(node => {
                if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
                    maxMinor = node.beaconMinor;
                }
            });
            minor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);
            major = currentFloor;

            document.getElementById('edit-node-major').value = major;
            document.getElementById('edit-node-minor').value = minor;
        }

        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        let finalName = mac || ("Indoor-Beacon-" + name);
        document.getElementById('edit-node-mac').value = finalName;

        updateNodeDetails(); 

        let cmd = `SERIAL_SET:M=${major},N=${minor},NAME=${finalName}\n`;
        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        const writer = textEncoder.writable.getWriter();
        await writer.write(cmd);
        writer.close();
        await writableStreamClosed;

        await port.close();
        alert(`✅ ซิงค์ผ่านสาย USB สำเร็จ!\nบอร์ดได้รับพิกัดและชื่อ "${finalName}" เรียบร้อยแล้ว`);

    } catch (error) {
        console.error(error);
        if (error.name !== 'NotFoundError') {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ USB: " + error.message);
        }
    } finally {
        btn.innerHTML = originalText;
    }
}

function openBTConfiguratorFromEdit() {
    currentEditingNodeIdForBT = document.getElementById('edit-node-id').value;
    const name = document.getElementById('edit-node-name').value;
    let major = document.getElementById('edit-node-major').value;
    let minor = document.getElementById('edit-node-minor').value;

    closeEditorCards();

    if (!major || !minor) {
        let maxMinor = 0;
        Object.values(customNodes).forEach(node => {
            if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
                maxMinor = node.beaconMinor;
            }
        });
        minor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);
        major = currentFloor;
    }

    const inputName = document.getElementById('bt-input-name');
    if (inputName) inputName.value = name;
    
    document.getElementById('bt-input-major').value = major;
    document.getElementById('bt-input-minor').value = minor;

    document.getElementById('bt-configurator-card').style.display = 'block';
}

async function connectBluetooth() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Indoor-Beacon' }],
            optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
        });

        bluetoothDevice = device;
        document.getElementById('bt-device-info').innerText = "กำลังเชื่อมต่อ...";

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
        configCharacteristic = characteristic;

        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const decoder = new TextDecoder('utf-8');
            const currStr = decoder.decode(value);

            document.getElementById('bt-connected-panel').style.display = 'block';
            document.getElementById('bt-device-name').innerText = device.name;
            document.getElementById('bt-device-info').innerText = currStr.replace("CURR:", "");

            const inputName = document.getElementById('bt-input-name');
            if (inputName) inputName.value = device.name;

            if (!document.getElementById('bt-input-major').value || !document.getElementById('bt-input-minor').value) {
                let maxMinor = 0;
                Object.values(customNodes).forEach(node => {
                    if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
                        maxMinor = node.beaconMinor;
                    }
                });
                let nextMinor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);

                document.getElementById('bt-input-major').value = currentFloor;
                document.getElementById('bt-input-minor').value = nextMinor;
            }
        });

        document.getElementById('btn-bt-connect').style.display = 'none';
        document.getElementById('btn-bt-disconnect').style.display = 'block';
        document.getElementById('btn-bt-save').disabled = false;

        device.addEventListener('gattserverdisconnected', disconnectBluetooth);

    } catch (error) {
        console.error(error);
        if (error.name === 'NotFoundError') {
            alert("ยกเลิกการเชื่อมต่อ หรือไม่พบบอร์ด ESP32 ที่อยู่ใกล้เคียง");
        } else if (error.name === 'NotSupportedError') {
            alert("เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth กรุณาใช้ Chrome หรือ Edge และเข้าใช้งานผ่าน https:// หรือ localhost");
        } else {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อบลูทูธ: " + error.message);
        }
    }
}

function disconnectBluetooth() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
    }
    bluetoothDevice = null;
    configCharacteristic = null;

    document.getElementById('bt-connected-panel').style.display = 'none';
    document.getElementById('btn-bt-connect').style.display = 'block';
    document.getElementById('btn-bt-disconnect').style.display = 'none';
    document.getElementById('btn-bt-save').disabled = true;
}

function autoGenerateBtConfigId() {
    let maxMinor = 0;
    Object.values(customNodes).forEach(node => {
        if (node.floor === currentFloor && node.beaconMinor !== null && node.beaconMinor > maxMinor) {
            maxMinor = node.beaconMinor;
        }
    });
    let nextMinor = maxMinor > 0 ? maxMinor + 1 : (currentFloor * 100 + 1);

    document.getElementById('bt-input-major').value = currentFloor;
    document.getElementById('bt-input-minor').value = nextMinor;
}

async function writeBluetoothConfig() {
    if (!configCharacteristic) return;

    const major = document.getElementById('bt-input-major').value;
    const minor = document.getElementById('bt-input-minor').value;

    if (!major || !minor) {
        alert("กรุณาระบุรหัส Major และ Minor ให้ครบถ้วน");
        return;
    }

    let cmd = `S:${major},${minor}`;

    try {
        const encoder = new TextEncoder('utf-8');
        const data = encoder.encode(cmd);

        if (currentEditingNodeIdForBT && customNodes[currentEditingNodeIdForBT]) {
            customNodes[currentEditingNodeIdForBT].beaconMajor = parseInt(major);
            customNodes[currentEditingNodeIdForBT].beaconMinor = parseInt(minor);

            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        }

        if (configCharacteristic.writeValueWithResponse) {
            await configCharacteristic.writeValueWithResponse(data);
        } else if (configCharacteristic.writeValueWithoutResponse) {
            await configCharacteristic.writeValueWithoutResponse(data);
        } else {
            await configCharacteristic.writeValue(data);
        }

        alert(`✅ ส่งข้อมูลสำเร็จและบันทึกลงโหนดเรียบร้อย!\n\nบอร์ด ESP32 ได้รับพิกัด M=${major}, N=${minor}\nบอร์ดกำลังเริ่มต้นทำงานใหม่...`);

        disconnectBluetooth();
        closeEditorCards();
    } catch (error) {
        console.error(error);
        alert("เกิดข้อผิดพลาดในการส่งข้อมูลไปยังบอร์ด: " + error.message);
    }
}

async function connectAndSyncSerial() {
    try {
        const major = document.getElementById('bt-input-major').value;
        const minor = document.getElementById('bt-input-minor').value;

        if (!major || !minor) {
            alert("กรุณาระบุรหัส Major และ Minor ให้ครบถ้วน");
            return;
        }

        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        let cmd = `SERIAL_SET:M=${major},N=${minor}\n`;

        if (currentEditingNodeIdForBT && customNodes[currentEditingNodeIdForBT]) {
            customNodes[currentEditingNodeIdForBT].beaconMajor = parseInt(major);
            customNodes[currentEditingNodeIdForBT].beaconMinor = parseInt(minor);

            saveStateToHistory();
            autoSaveToLocalStorage();
            renderAllElements();
        }

        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        const writer = textEncoder.writable.getWriter();
        await writer.write(cmd);
        writer.close();
        await writableStreamClosed;

        await port.close();
        alert(`✅ ซิงค์ข้อมูลและบันทึกลงโหนดสำเร็จ!\n\nบอร์ดได้รับพิกัดเรียบร้อยแล้วและกำลังรีสตาร์ทตัวเอง`);
        closeEditorCards();

    } catch (error) {
        console.error(error);
        if (error.name === 'NotFoundError') {
            // User cancelled
        } else if (error.name === 'NotSupportedError') {
            alert("เบราว์เซอร์นี้ไม่รองรับ Web Serial API กรุณาใช้ Chrome หรือ Edge บนคอมพิวเตอร์");
        } else {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อสาย USB:\n" + error.message + "\n\n💡 คำแนะนำ: โปรดตรวจสอบให้แน่ใจว่าได้ปิดหน้าต่าง Serial Monitor ในโปรแกรม Arduino IDE ไปแล้ว เพื่อไม่ให้พอร์ตชนกันครับ");
        }
    }
}
