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
  7. *** LƯU LỊCH SỬ SENSOR RA FILE JSON ***
========================================
*/

// #region ===== IMPORT THƯ VIỆN =====
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs"); // ← Mới: đọc/ghi file
const { Server } = require("socket.io");
// #endregion

// #region ===== KHỞI TẠO SERVER =====
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
// #endregion

// #region ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// #endregion

// #region ===== CẤU HÌNH LƯU FILE =====
const DATA_FILE = path.join(__dirname, "data", "history.json"); // nơi lưu
const MAX_HISTORY = 500; // giữ tối đa 500 bản ghi
const SAVE_EVERY = 10000; // lưu file mỗi 10 giây (ms)

// Tạo thư mục data/ nếu chưa có
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}

// Đọc lịch sử cũ nếu file đã tồn tại (giữ data qua restart)
let sensorHistory = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    sensorHistory = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    console.log(`📂 Đã load ${sensorHistory.length} bản ghi lịch sử`);
  } catch (e) {
    console.log("⚠️  File history lỗi, bắt đầu mới");
    sensorHistory = [];
  }
}
// #endregion

// #region ===== STATE (TRẠNG THÁI HỆ THỐNG) =====
const state = {
  sensors: {
    temperature: 29,
    light: 600,
    smoke: 0,
  },

  devices: {
    light: false,
    fan: false,
    buzzer: false,
  },

  modes: {
    light: "AUTO",
    fan: "AUTO",
    buzzer: "AUTO",
  },

  alerts: {
    fire: false,
  },

  thresholds: {
    lightOn: 450,
    lightOff: 400,
    fanOn: 30,
    fanOff: 28,
  },

  system: {
    connectedDevices: 0,
    updatedAt: new Date().toISOString(),
  },

  logs: [],
};
// #endregion

// #region ===== UTILS =====
function addLog(type, message) {
  state.logs.unshift({
    id: Date.now() + Math.random(),
    type,
    message,
    time: new Date().toISOString(),
  });
  state.logs = state.logs.slice(0, 20);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateTimestamp() {
  state.system.updatedAt = new Date().toISOString();
}

function broadcastState() {
  io.emit("state:update", state);
}
// #endregion

// #region ===== LƯU LỊCH SỬ SENSOR =====

// Thêm 1 bản ghi mới vào mảng history
function recordHistory() {
  const record = {
    time: new Date().toISOString(),
    temperature: state.sensors.temperature,
    light: state.sensors.light,
    smoke: state.sensors.smoke,
    fan: state.devices.fan,
    light_dev: state.devices.light, // thiết bị đèn
    buzzer: state.devices.buzzer,
  };

  sensorHistory.push(record);

  // Cắt bớt nếu quá MAX_HISTORY
  if (sensorHistory.length > MAX_HISTORY) {
    sensorHistory = sensorHistory.slice(-MAX_HISTORY);
  }
}

// Ghi file xuống đĩa
function saveHistoryToFile() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(sensorHistory, null, 2));
  } catch (e) {
    console.error("❌ Lỗi ghi file:", e.message);
  }
}

// Tự động lưu file mỗi SAVE_EVERY ms
setInterval(saveHistoryToFile, SAVE_EVERY);

// #endregion

// #region ===== AUTOMATION LOGIC =====
function applyAutomation() {
  const { temperature, light, smoke } = state.sensors;
  const { thresholds, modes, devices } = state;

  // Cảnh báo cháy (digital: smoke === 1)
  const hadFire = state.alerts.fire;
  state.alerts.fire = smoke === 1;

  // Buzzer AUTO/MANUAL
  if (modes.buzzer === "AUTO") {
    state.devices.buzzer = state.alerts.fire;
  }
  // Nếu MANUAL → giữ nguyên devices.buzzer do user điều khiển

  if (!hadFire && state.alerts.fire)
    addLog("danger", "🔥 Phát hiện khói! Buzzer bật.");
  if (hadFire && !state.alerts.fire)
    addLog("info", "✅ Mức khói an toàn trở lại.");

  // Đèn tự động
  if (modes.light === "AUTO") {
    if (light > thresholds.lightOn && !devices.light) {
      devices.light = true;
      addLog("auto", "🌙 Trời tối → bật đèn.");
    } else if (light < thresholds.lightOff && devices.light) {
      devices.light = false;
      addLog("auto", "☀️ Trời sáng → tắt đèn.");
    }
  }

  // Quạt tự động
  if (modes.fan === "AUTO") {
    if (temperature > thresholds.fanOn && !devices.fan) {
      devices.fan = true;
      addLog("auto", "🔥 Nhiệt độ cao → bật quạt.");
    } else if (temperature < thresholds.fanOff && devices.fan) {
      devices.fan = false;
      addLog("auto", "❄️ Nhiệt độ thấp → tắt quạt.");
    }
  }

  updateTimestamp();
}
// #endregion

// #region ===== API WEB CLIENT =====

app.get("/api/status", (req, res) => res.json(state));

app.post("/api/control/light", (req, res) => {
  const { action } = req.body;
  if (!["ON", "OFF", "AUTO"].includes(action))
    return res.status(400).json({ error: "Lệnh không hợp lệ" });

  if (action === "AUTO") {
    state.modes.light = "AUTO";
    addLog("manual", "Đèn chuyển AUTO");
  } else {
    state.modes.light = "MANUAL";
    state.devices.light = action === "ON";
    addLog("manual", `User ${action} đèn`);
  }

  applyAutomation();
  broadcastState();
  res.json({ success: true });
});

app.post("/api/control/fan", (req, res) => {
  const { action } = req.body;
  if (!["ON", "OFF", "AUTO"].includes(action))
    return res.status(400).json({ error: "Lệnh không hợp lệ" });

  if (action === "AUTO") {
    state.modes.fan = "AUTO";
  } else {
    state.modes.fan = "MANUAL";
    state.devices.fan = action === "ON";
  }

  addLog("manual", `User ${action} quạt`);
  applyAutomation();
  broadcastState();
  res.json({ success: true });
});

app.post("/api/control/buzzer", (req, res) => {
  const { action } = req.body;
  if (!["ON", "OFF", "AUTO"].includes(action))
    return res.status(400).json({ error: "Lệnh không hợp lệ" });

  if (action === "AUTO") {
    state.modes.buzzer = "AUTO";
    addLog("manual", "Buzzer chuyển AUTO");
  } else {
    state.modes.buzzer = "MANUAL";
    state.devices.buzzer = action === "ON";
    addLog("manual", `User ${action} buzzer`);
  }

  applyAutomation();
  broadcastState();
  res.json({ success: true });
});

app.post("/api/simulate", (req, res) => {
  const { temperature, light, smoke } = req.body;
  if (typeof temperature === "number")
    state.sensors.temperature = clamp(temperature, 0, 80);
  if (typeof light === "number") state.sensors.light = clamp(light, 0, 1023);
  if (typeof smoke === "number") state.sensors.smoke = smoke === 1 ? 1 : 0;

  addLog("info", "Giả lập dữ liệu cảm biến");
  applyAutomation();
  broadcastState();
  res.json({ success: true });
});

// ===== API LẤY LỊCH SỬ (mới) =====

// Lấy toàn bộ lịch sử
app.get("/api/history", (req, res) => {
  res.json(sensorHistory);
});

// Lấy N bản ghi gần nhất  →  /api/history/50
app.get("/api/history/:limit", (req, res) => {
  const limit = parseInt(req.params.limit) || 50;
  res.json(sensorHistory.slice(-limit));
});

// Xóa toàn bộ lịch sử
app.delete("/api/history", (req, res) => {
  sensorHistory = [];
  saveHistoryToFile();
  addLog("info", "🗑️ Đã xóa toàn bộ lịch sử");
  broadcastState();
  res.json({ success: true });
});

// #endregion

// #region ===== API ESP8266 =====
app.post("/api/esp/data", (req, res) => {
  const { temperature, light, smoke } = req.body;
  if (typeof temperature === "number")
    state.sensors.temperature = clamp(temperature, 0, 80);
  if (typeof light === "number") state.sensors.light = clamp(light, 0, 1023);
  if (typeof smoke === "number") state.sensors.smoke = smoke === 1 ? 1 : 0;

  addLog("iot", "ESP gửi dữ liệu");
  applyAutomation();
  recordHistory();

  io.emit("sensorData", {
    temperature: state.sensors.temperature,
    light: state.sensors.light,
    smoke: state.sensors.smoke,
  });

  broadcastState();
  res.json({ success: true });
});

app.get("/api/esp/control", (req, res) => res.json(state.devices));
// #endregion

// #region ===== SOCKET.IO =====
io.on("connection", (socket) => {
  state.system.connectedDevices++;
  addLog("info", "Client kết nối");
  socket.emit("state:update", state);
  broadcastState();

  socket.on("disconnect", () => {
    state.system.connectedDevices = Math.max(
      0,
      state.system.connectedDevices - 1,
    );
    addLog("info", "Client ngắt kết nối");
    broadcastState();
  });
});
// #endregion

// // #region ===== SIMULATION LOOP =====
// setInterval(() => {
//   state.sensors.temperature = Number(clamp(state.sensors.temperature + (Math.random() - 0.5), 20, 40).toFixed(1));
//   state.sensors.light       = clamp(state.sensors.light + Math.floor(Math.random() * 100 - 50), 0, 1023);
//   // Smoke: digital (0/1), không random — chỉ đổi khi user gửi từ Simulation

//   applyAutomation();
//   recordHistory();   // ← Ghi lịch sử mỗi 3 giây
//   broadcastState();

//   io.emit('sensorData', {
//     temperature: state.sensors.temperature,
//     light:       state.sensors.light,
//     smoke:       state.sensors.smoke
//   });
// }, 3000);
// // #endregion

// #region ===== START SERVER =====
const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server: http://10.252.216.60:${PORT}`);
  console.log(`📁 Lịch sử lưu tại: ${DATA_FILE}`);
});

addLog("info", "Hệ thống Smart Home khởi động");
applyAutomation();
// #endregion
