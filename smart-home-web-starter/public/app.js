/*
File này làm 4 việc chính:
  Nhận dữ liệu realtime từ server
  Hiển thị dữ liệu lên giao diện
  Gửi lệnh khi người dùng bấm nút
  Đồng bộ trạng thái liên tục
*/

/*========== KET NOI REALTIME VOI SERVER ==========*/
const socket = io();

/*========== TAO CHART TRUOC (QUAN TRONG) ==========*/
const ctx = document.getElementById('myChart').getContext('2d');

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Temperature (°C)',
        data: [],
        borderColor: 'red',
        borderWidth: 2,
        tension: 0.3
      },
      {
        label: 'Light',
        data: [],
        borderColor: 'orange',
        borderWidth: 2,
        tension: 0.3
      },
      {
        label: 'Smoke',
        data: [],
        borderColor: 'gray',
        borderWidth: 2,
        tension: 0.3
      }
    ]
  },
  options: {
    animation: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  }
});

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

/*========== HAM CAP NHAT GIAO DIEN ==========*/
function renderState(state) {
  if (!state) return;

  // Sensor
  el.temperature.textContent = state.sensors.temperature;
  el.light.textContent = state.sensors.light;
  el.smoke.textContent = state.sensors.smoke;

  // Devices
  el.lightState.innerHTML = state.devices.light
    ? '<span class="badge-on">ON</span>'
    : '<span class="badge-off">OFF</span>';

  el.fanState.innerHTML = state.devices.fan
    ? '<span class="badge-on">ON</span>'
    : '<span class="badge-off">OFF</span>';

  el.buzzerState.innerHTML = state.devices.buzzer
    ? '<span class="badge-on">RINGING</span>'
    : '<span class="badge-off">OFF</span>';

  // Mode
  el.lightMode.innerHTML = state.modes.light === 'AUTO'
    ? '<span class="badge-auto">AUTO</span>'
    : '<span class="badge-manual">MANUAL</span>';

  el.fanMode.innerHTML = state.modes.fan === 'AUTO'
    ? '<span class="badge-auto">AUTO</span>'
    : '<span class="badge-manual">MANUAL</span>';

  // Màu sắc sensor
  el.temperature.style.color = getColor(state.sensors.temperature, 'temp');
  el.light.style.color = getColor(state.sensors.light, 'light');
  el.smoke.style.color = getColor(state.sensors.smoke, 'smoke');

  // System
  el.connectedDevices.textContent = state.system.connectedDevices;
  el.updatedAt.textContent = formatTime(state.system.updatedAt);
  el.lightThreshold.textContent = `${state.thresholds.lightOn} / ${state.thresholds.lightOff}`;
  el.fanThreshold.textContent = `${state.thresholds.fanOn}°C / ${state.thresholds.fanOff}°C`;
  el.smokeThreshold.textContent = state.thresholds.smoke;

  // Alert
  el.fireAlert.classList.toggle('hidden', !state.alerts.fire);

  // Logs
  el.logs.innerHTML = '';
  state.logs.forEach((log) => {
    const li = document.createElement('li');
    li.innerHTML = `${log.message}<br><span class="log-time">${formatTime(log.time)} - ${log.type}</span>`;
    el.logs.appendChild(li);
  });
}

// Hàm lấy màu dựa trên giá trị sensor
function getColor(value, type) {
  if (type === 'temp') return value > 30 ? 'red' : 'green';
  if (type === 'light') return value < 300 ? 'orange' : 'yellow';
  if (type === 'smoke') return value > 200 ? 'red' : 'gray';
}

/*========== HAM GOI API ==========*/
async function callApi(url, body = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(error.error || 'Có lỗi xảy ra');
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(err);
    alert('Không kết nối được server');
    return null;
  }
}

/*========== LOAD BAN DAU ==========*/
async function loadInitialState() {
  const res = await fetch('/api/status');
  const data = await res.json();
  renderState(data);
}

/*========== BUTTON ==========*/
document.querySelectorAll('button[data-device]').forEach((button) => {
  button.addEventListener('click', async () => {
    const device = button.dataset.device;
    const action = button.dataset.action;
    await callApi(`/api/control/${device}`, { action });
  });
});

// simulate
el.simulateBtn.addEventListener('click', async () => {
  await callApi('/api/simulate', {
    temperature: Number(el.inputTemperature.value),
    light: Number(el.inputLight.value),
    smoke: Number(el.inputSmoke.value)
  });
});

// reset alarm
el.resetAlarmBtn.addEventListener('click', async () => {
  await callApi('/api/alarm/reset');
});

/*========== SOCKET ==========*/
socket.on('connect', () => {
  el.connectionStatus.textContent = 'Realtime: Connected';
  el.connectionStatus.style.background = '#166534';
});

socket.on('disconnect', () => {
  el.connectionStatus.textContent = 'Realtime: Disconnected';
  el.connectionStatus.style.background = '#991b1b';
});

// cập nhật state
socket.on('state:update', (state) => {
  renderState(state);
});

// nhận data để vẽ chart
socket.on("sensorData", (data) => {
  if (!data) return;

  console.log("DATA:", data); // debug

  const time = new Date().toLocaleTimeString();

  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(data.temperature);
  chart.data.datasets[1].data.push(data.light);
  chart.data.datasets[2].data.push(data.smoke);

  // giới hạn 20 điểm
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }

  chart.update();
});

/*========== CHAY LAN DAU ==========*/
loadInitialState();