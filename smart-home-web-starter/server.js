/*
========================================
 SMART HOME SERVER (NodeJS + Socket.IO)
========================================
Chức năng chính:
  1. Lưu trạng thái hệ thống
  2. Tự động điều khiển thiết bị
  3. Cung cấp API cho Web
  4. Gửi dữ liệu realtime (Socket.IO)
  5. Nhận dữ liệu từ ESP8266
  6. Giả lập cảm biến
========================================
*/


// #region ===== IMPORT THƯ VIỆN =====
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
// #endregion


// #region ===== KHỞI TẠO SERVER =====
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
// #endregion


// #region ===== MIDDLEWARE =====
app.use(express.json()); // Đọc JSON từ request
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend
// #endregion


// #region ===== STATE (TRẠNG THÁI HỆ THỐNG) =====
const state = {
  sensors: {
    temperature: 29,
    light: 600,
    smoke: 80
  },

  devices: {
    light: false,
    fan: false,
    buzzer: false
  },

  modes: {
    light: 'AUTO', // AUTO | MANUAL
    fan: 'AUTO'
  },

  alerts: {
    fire: false
  },

  thresholds: {
    lightOn: 350,
    lightOff: 500,
    fanOn: 30,
    fanOff: 28,
    smoke: 250
  },

  system: {
    connectedDevices: 0,
    updatedAt: new Date().toISOString()
  },

  logs: []
};
// #endregion


// #region ===== UTILS =====

// Ghi log (giữ tối đa 20 log)
function addLog(type, message) {
  state.logs.unshift({
    id: Date.now() + Math.random(),
    type,
    message,
    time: new Date().toISOString()
  });

  state.logs = state.logs.slice(0, 20);
}

// Giới hạn giá trị trong khoảng
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Cập nhật timestamp hệ thống
function updateTimestamp() {
  state.system.updatedAt = new Date().toISOString();
}

// Gửi toàn bộ state xuống client
function broadcastState() {
  io.emit('state:update', state);
}

// #endregion


// #region ===== AUTOMATION LOGIC (TỰ ĐỘNG HÓA) =====
function applyAutomation() {
  const { temperature, light, smoke } = state.sensors;
  const { thresholds, modes, devices } = state;

  // ===== CẢNH BÁO CHÁY =====
  const hadFire = state.alerts.fire;
  state.alerts.fire = smoke >= thresholds.smoke;
  state.devices.buzzer = state.alerts.fire;

  if (!hadFire && state.alerts.fire) {
    addLog('danger', '🔥 Phát hiện khói! Buzzer bật.');
  }

  if (hadFire && !state.alerts.fire) {
    addLog('info', '✅ Mức khói an toàn trở lại.');
  }

  // ===== ĐÈN TỰ ĐỘNG =====
  if (modes.light === 'AUTO') {
    if (light < thresholds.lightOn && !devices.light) {
      devices.light = true;
      addLog('auto', '🌙 Trời tối → bật đèn.');
    } 
    else if (light > thresholds.lightOff && devices.light) {
      devices.light = false;
      addLog('auto', '☀️ Trời sáng → tắt đèn.');
    }
  }

  // ===== QUẠT TỰ ĐỘNG =====
  if (modes.fan === 'AUTO') {
    if (temperature > thresholds.fanOn && !devices.fan) {
      devices.fan = true;
      addLog('auto', '🔥 Nhiệt độ cao → bật quạt.');
    } 
    else if (temperature < thresholds.fanOff && devices.fan) {
      devices.fan = false;
      addLog('auto', '❄️ Nhiệt độ thấp → tắt quạt.');
    }
  }

  updateTimestamp();
}
// #endregion


// #region ===== API (WEB CLIENT) =====

// Lấy toàn bộ trạng thái
app.get('/api/status', (req, res) => {
  res.json(state);
});

// Điều khiển đèn
app.post('/api/control/light', (req, res) => {
  const { action } = req.body;

  if (!['ON', 'OFF', 'AUTO'].includes(action)) {
    return res.status(400).json({ error: 'Lệnh không hợp lệ' });
  }

  if (action === 'AUTO') {
    state.modes.light = 'AUTO';
    addLog('manual', 'Đèn chuyển AUTO');
  } else {
    state.modes.light = 'MANUAL';
    state.devices.light = action === 'ON';
    addLog('manual', `User ${action} đèn`);
  }

  applyAutomation();
  broadcastState();

  res.json({ success: true });
});

// Điều khiển quạt
app.post('/api/control/fan', (req, res) => {
  const { action } = req.body;

  if (!['ON', 'OFF', 'AUTO'].includes(action)) {
    return res.status(400).json({ error: 'Lệnh không hợp lệ' });
  }

  if (action === 'AUTO') {
    state.modes.fan = 'AUTO';
  } else {
    state.modes.fan = 'MANUAL';
    state.devices.fan = action === 'ON';
  }

  addLog('manual', `User ${action} quạt`);

  applyAutomation();
  broadcastState();

  res.json({ success: true });
});

// Giả lập cảm biến
app.post('/api/simulate', (req, res) => {
  const { temperature, light, smoke } = req.body;

  if (typeof temperature === 'number')
    state.sensors.temperature = clamp(temperature, 0, 80);

  if (typeof light === 'number')
    state.sensors.light = clamp(light, 0, 1023);

  if (typeof smoke === 'number')
    state.sensors.smoke = clamp(smoke, 0, 1023);

  addLog('info', 'Giả lập dữ liệu cảm biến');

  applyAutomation();
  broadcastState();

  res.json({ success: true });
});

// Reset báo cháy
app.post('/api/alarm/reset', (req, res) => {
  state.sensors.smoke = 0;
  addLog('info', 'Reset cảnh báo');

  applyAutomation();
  broadcastState();

  res.json({ success: true });
});

// #endregion


// #region ===== API (ESP8266) =====

// ESP gửi dữ liệu lên
app.post('/api/esp/data', (req, res) => {
  const { temperature, light, smoke } = req.body;

  if (typeof temperature === 'number') state.sensors.temperature = clamp(temperature, 0, 80);
  if (typeof light === 'number') state.sensors.light = clamp(light, 0, 1023);
  if (typeof smoke === 'number') state.sensors.smoke = clamp(smoke, 0, 1023);

  addLog('iot', 'ESP gửi dữ liệu');

  applyAutomation();
  broadcastState();

  res.json({ success: true });
});

// ESP lấy lệnh điều khiển
app.get('/api/esp/control', (req, res) => {
  res.json(state.devices);
});

// #endregion


// #region ===== SOCKET.IO =====
io.on('connection', (socket) => {
  state.system.connectedDevices++;

  addLog('info', 'Client kết nối');

  socket.emit('state:update', state);
  broadcastState();

  socket.on('disconnect', () => {
    state.system.connectedDevices = Math.max(0, state.system.connectedDevices - 1);
    addLog('info', 'Client ngắt kết nối');
    broadcastState();
  });
});
// #endregion


// #region ===== SIMULATION LOOP =====
setInterval(() => {
  state.sensors.temperature = Number(
    clamp(state.sensors.temperature + (Math.random() - 0.5), 20, 40).toFixed(1)
  );

  state.sensors.light = clamp(
    state.sensors.light + Math.floor(Math.random() * 100 - 50),
    0,
    1023
  );

  state.sensors.smoke = clamp(
    state.sensors.smoke + Math.floor(Math.random() * 10 - 5),
    0,
    400
  );

  applyAutomation();
  broadcastState();

  io.emit("sensorData", {
    temperature: state.sensors.temperature,
    light: state.sensors.light,
    smoke: state.sensors.smoke
  });
}, 3000);
// #endregion


// #region ===== START SERVER =====
const PORT = 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);   // PHAI THAY DOI LOCALHOST CHO IP MANG LAN CUA MINH
});

addLog('info', 'Hệ thống Smart Home khởi động');
applyAutomation();
// #endregion