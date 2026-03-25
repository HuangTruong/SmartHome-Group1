/*
File này làm 4 việc chính:
  Nhận dữ liệu realtime từ server
  Hiển thị dữ liệu lên giao diện
  Gửi lệnh khi người dùng bấm nút
  Đồng bộ trạng thái liên tục
*/

/*========== KET NOI REALTIME VOI SERVER ==========*/
const socket = io();

/*========== LUU TAT CA ID ==========*/
const el = {
  connectionStatus: document.getElementById('connectionStatus'),
  fireAlert: document.getElementById('fireAlert'),
  temperature: document.getElementById('temperature'),
  light: document.getElementById('light'),
  smoke: document.getElementById('smoke'),
  lightState: document.getElementById('lightState'),
  fanState: document.getElementById('fanState'),
  buzzerState: document.getElementById('buzzerState'),
  lightMode: document.getElementById('lightMode'),
  fanMode: document.getElementById('fanMode'),
  connectedDevices: document.getElementById('connectedDevices'),
  updatedAt: document.getElementById('updatedAt'),
  lightThreshold: document.getElementById('lightThreshold'),
  fanThreshold: document.getElementById('fanThreshold'),
  smokeThreshold: document.getElementById('smokeThreshold'),
  logs: document.getElementById('logs'),
  inputTemperature: document.getElementById('inputTemperature'),
  inputLight: document.getElementById('inputLight'),
  inputSmoke: document.getElementById('inputSmoke'),
  simulateBtn: document.getElementById('simulateBtn'),
  resetAlarmBtn: document.getElementById('resetAlarmBtn')
};

// Format thời gian
function formatTime(iso) {
  return new Date(iso).toLocaleString('vi-VN');
}

/*========== HAM CAP NHAT GIA DIEN (TU WEB LEN SERVER) ==========*/
function renderState(state) {
  // Cập nhật cảm biến
  el.temperature.textContent = state.sensors.temperature;
  el.light.textContent = state.sensors.light;
  el.smoke.textContent = state.sensors.smoke;

  // Cập nhật trạng thái thiệt bị
  el.lightState.innerHTML = state.devices.light
    ? '<span class="badge-on">BAT</span>'
    : '<span class="badge-off">TAT</span>';

  el.fanState.innerHTML = state.devices.fan
    ? '<span class="badge-on">BAT</span>'
    : '<span class="badge-off">TAT</span>';

  el.buzzerState.innerHTML = state.devices.buzzer
    ? '<span class="badge-on">DANG KEU</span>'
    : '<span class="badge-off">TAT</span>';

  el.lightMode.innerHTML = state.modes.light === 'AUTO'
    ? '<span class="badge-auto">AUTO</span>'
    : '<span class="badge-manual">MANUAL</span>';

  el.fanMode.innerHTML = state.modes.fan === 'AUTO'
    ? '<span class="badge-auto">AUTO</span>'
    : '<span class="badge-manual">MANUAL</span>';

  // Cập nhật thông tin hệ thống
  el.connectedDevices.textContent = state.system.connectedDevices;
  el.updatedAt.textContent = formatTime(state.system.updatedAt);
  el.lightThreshold.textContent = `${state.thresholds.lightOn} / ${state.thresholds.lightOff}`;
  el.fanThreshold.textContent = `${state.thresholds.fanOn}°C / ${state.thresholds.fanOff}°C`;
  el.smokeThreshold.textContent = state.thresholds.smoke;

  // Cảnh báo cháy
  el.fireAlert.classList.toggle('hidden', !state.alerts.fire);

  // Log (Nhật ký)
  el.logs.innerHTML = '';
  state.logs.forEach((log) => {
    const li = document.createElement('li');
    li.innerHTML = `${log.message}<br><span class="log-time">${formatTime(log.time)} - ${log.type}</span>`;
    el.logs.appendChild(li);
  });
}

/*========== HAM GOI API ==========*/
async function callApi(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  // Xử lý lỗi
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Loi khong xac dinh' }));
    alert(error.error || 'Co loi xay ra');
    return null;
  }

  return res.json();
}

/*========== HAM LOAD DU LIEU BAN DAU ==========*/
async function loadInitialState() {
  const res = await fetch('/api/status');
  const data = await res.json();
  renderState(data);
}

/*========== XU LY NUT BAM ==========*/
// Đèn / quạt
document.querySelectorAll('button[data-device]').forEach((button) => {
  button.addEventListener('click', async () => {
    const device = button.dataset.device;
    const action = button.dataset.action;
    await callApi(`/api/control/${device}`, { action });
  });
});

// Mô phỏng cảm biến
el.simulateBtn.addEventListener('click', async () => {
  await callApi('/api/simulate', {
    temperature: Number(el.inputTemperature.value),
    light: Number(el.inputLight.value),
    smoke: Number(el.inputSmoke.value)
  });
});

// reset báo cháy
el.resetAlarmBtn.addEventListener('click', async () => {
  await callApi('/api/alarm/reset');
});

/*========== REALTIME SOCKET ==========*/
// Khi kết nối
socket.on('connect', () => {
  el.connectionStatus.textContent = 'Realtime: Da ket noi';
  el.connectionStatus.style.background = '#166534';
});

// Khi mất kết nối
socket.on('disconnect', () => {
  el.connectionStatus.textContent = 'Realtime: Mat ket noi';
  el.connectionStatus.style.background = '#991b1b';
});

// Nhận dữ liệu realtime
socket.on('state:update', (state) => {
  renderState(state);
});

/*========== CHAY LAN DAU (LOAD DU LIEU) ==========*/
loadInitialState();
