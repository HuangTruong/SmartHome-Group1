/*
  SmartHome OS — app.js
  - Login screen with password gate
  - Dark / Light mode toggle
  - Realtime Socket.IO connection
  - 3 separate chart rendering (Temp, Light, Smoke)
  - Device control API calls (Fan, Light, Buzzer)
  - State rendering
*/

/* =============================================
   LOGIN SCREEN
============================================= */
const CORRECT_PASSWORD = '1234'; // Đổi mật khẩu tại đây

const loginScreen = document.getElementById('loginScreen');
const loginInput  = document.getElementById('loginInput');
const loginBtn    = document.getElementById('loginBtn');
const loginError  = document.getElementById('loginError');
const appEl       = document.getElementById('app');

function doLogin() {
  const val = loginInput.value.trim();
  if (val === CORRECT_PASSWORD) {
    loginError.classList.add('hidden');
    loginScreen.style.transition = 'opacity 0.4s ease';
    loginScreen.style.opacity = '0';
    setTimeout(() => {
      loginScreen.classList.add('hidden');
      appEl.classList.remove('hidden');
      loadInitialState();
    }, 400);
  } else {
    loginError.classList.remove('hidden');
    loginInput.value = '';
    loginInput.focus();
    loginInput.style.borderColor = 'var(--red)';
    setTimeout(() => { loginInput.style.borderColor = ''; }, 1200);
  }
}

loginBtn.addEventListener('click', doLogin);
loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

/* =============================================
   VIEW MODE TOGGLE — SIMPLE / SMART
============================================= */
const viewModeToggle = document.getElementById('viewModeToggle');
const vmBtns = viewModeToggle.querySelectorAll('.vm-btn');

// Default: simple mode
let currentMode = localStorage.getItem('smarthome-mode') || 'simple';
applyViewMode(currentMode);

vmBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    localStorage.setItem('smarthome-mode', currentMode);
    applyViewMode(currentMode);
  });
});

function applyViewMode(mode) {
  // Toggle body class
  document.body.classList.toggle('mode-simple', mode === 'simple');

  // Update active button
  vmBtns.forEach(btn => {
    btn.classList.toggle('vm-active', btn.dataset.mode === mode);
  });
}

/* =============================================
   DARK / LIGHT MODE TOGGLE
============================================= */
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

// Persist theme
const savedTheme = localStorage.getItem('smarthome-theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('smarthome-theme', next);
  updateChartTheme();
});

/* =============================================
   3 SEPARATE CHARTS SETUP
============================================= */
function getChartGridColor() {
  return html.getAttribute('data-theme') === 'dark'
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(0,0,0,0.06)';
}

function getChartTextColor() {
  return html.getAttribute('data-theme') === 'dark'
    ? '#64748b'
    : '#94a3b8';
}

function createChart(canvasId, label, borderColor, yMin, yMax, stepped) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: label,
        data: [],
        borderColor: borderColor,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: borderColor,
        tension: stepped ? 0 : 0.4,
        fill: {
          target: 'origin',
          above: borderColor + '18'
        },
        stepped: stepped || false
      }]
    },
    options: {
      animation: false,
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111820',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleFont: { family: 'JetBrains Mono', size: 11 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: '#64748b',
          bodyColor: '#e2e8f0',
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: getChartGridColor() },
          ticks: {
            color: getChartTextColor(),
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: 8
          }
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: getChartGridColor() },
          ticks: {
            color: getChartTextColor(),
            font: { family: 'JetBrains Mono', size: 10 },
            stepSize: stepped ? 1 : undefined
          }
        }
      }
    }
  });
}

const chartTemp  = createChart('chartTemp',  'Temperature (°C)', '#f87171', 15, 45, false);
const chartLight = createChart('chartLight', 'Light',            '#fbbf24', 0, 1023, false);
const chartSmoke = createChart('chartSmoke', 'Smoke',            '#94a3b8', -0.1, 1.3, true);

function updateChartTheme() {
  const gridColor = getChartGridColor();
  const textColor = getChartTextColor();

  [chartTemp, chartLight, chartSmoke].forEach(chart => {
    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.y.grid.color = gridColor;
    chart.options.scales.x.ticks.color = textColor;
    chart.options.scales.y.ticks.color = textColor;
    chart.update();
  });
}

/* =============================================
   ELEMENT REFERENCES
============================================= */
const el = {
  connectionStatus: document.getElementById('connectionStatus'),
  fireAlert:        document.getElementById('fireAlert'),
  temperature:      document.getElementById('temperature'),
  light:            document.getElementById('light'),
  smoke:            document.getElementById('smoke'),
  smokeStatus:      document.getElementById('smokeStatus'),
  barTemp:          document.getElementById('barTemp'),
  barLight:         document.getElementById('barLight'),
  lightState:       document.getElementById('lightState'),
  fanState:         document.getElementById('fanState'),
  buzzerState:      document.getElementById('buzzerState'),
  lightMode:        document.getElementById('lightMode'),
  fanMode:          document.getElementById('fanMode'),
  buzzerMode:       document.getElementById('buzzerMode'),
  connectedDevices: document.getElementById('connectedDevices'),
  updatedAt:        document.getElementById('updatedAt'),
  lightThreshold:   document.getElementById('lightThreshold'),
  fanThreshold:     document.getElementById('fanThreshold'),
  logs:             document.getElementById('logs'),
  logCount:         document.getElementById('logCount'),
  inputTemperature: document.getElementById('inputTemperature'),
  inputLight:       document.getElementById('inputLight'),
  inputSmoke:       document.getElementById('inputSmoke'),
  simulateBtn:      document.getElementById('simulateBtn'),
};

/* =============================================
   FORMAT HELPERS
============================================= */
function formatTime(iso) {
  return new Date(iso).toLocaleString('vi-VN');
}

function formatTimeShort(iso) {
  return new Date(iso).toLocaleTimeString('vi-VN');
}

function stateBadge(on, onLabel = 'ON', offLabel = 'OFF') {
  return on
    ? `<span class="state-badge state-on">${onLabel}</span>`
    : `<span class="state-badge state-off">${offLabel}</span>`;
}

function modeBadge(mode) {
  return mode === 'AUTO'
    ? `<span class="mode-badge mode-auto">AUTO</span>`
    : `<span class="mode-badge mode-manual">MANUAL</span>`;
}

/* =============================================
   RENDER STATE
============================================= */
function renderState(state) {
  if (!state) return;

  // Sensors
  const temp  = state.sensors.temperature;
  const light = state.sensors.light;
  const smoke = state.sensors.smoke;

  el.temperature.textContent = temp;
  el.light.textContent = light;
  el.smoke.textContent = smoke;

  // Progress bars (only for temp and light now)
  el.barTemp.style.width  = Math.min((temp / 40) * 100, 100) + '%';
  el.barLight.style.width = Math.min((light / 1023) * 100, 100) + '%';

  // Smoke digital status display
  if (smoke === 1) {
    el.smokeStatus.textContent = 'CÓ KHÓI';
    el.smokeStatus.className = 'smoke-status smoke-danger';
  } else {
    el.smokeStatus.textContent = 'AN TOÀN';
    el.smokeStatus.className = 'smoke-status smoke-safe';
  }

  // Devices
  el.fanState.innerHTML   = stateBadge(state.devices.fan);
  el.lightState.innerHTML = stateBadge(state.devices.light);
  el.buzzerState.innerHTML = stateBadge(state.devices.buzzer, 'RINGING', 'OFF');

  // Modes
  el.fanMode.innerHTML    = modeBadge(state.modes.fan);
  el.lightMode.innerHTML  = modeBadge(state.modes.light);
  el.buzzerMode.innerHTML = modeBadge(state.modes.buzzer);

  // System info
  el.connectedDevices.textContent = state.system.connectedDevices;
  el.updatedAt.textContent        = formatTime(state.system.updatedAt);
  el.lightThreshold.textContent   = `${state.thresholds.lightOn} / ${state.thresholds.lightOff}`;
  el.fanThreshold.textContent     = `${state.thresholds.fanOn}°C / ${state.thresholds.fanOff}°C`;

  // Fire alert
  el.fireAlert.classList.toggle('hidden', !state.alerts.fire);

  // Logs
  el.logs.innerHTML = '';
  state.logs.forEach((log) => {
    const li = document.createElement('li');
    li.className = 'log-item';

    const dotClass = {
      info:   'log-dot-info',
      danger: 'log-dot-danger',
      auto:   'log-dot-auto',
      manual: 'log-dot-manual',
      iot:    'log-dot-iot'
    }[log.type] || 'log-dot-info';

    li.innerHTML = `
      <span class="log-dot ${dotClass}"></span>
      <div class="log-body">
        <div class="log-msg">${log.message}</div>
        <div class="log-meta">${formatTime(log.time)} · ${log.type}</div>
      </div>
    `;
    el.logs.appendChild(li);
  });

  el.logCount.textContent = `${state.logs.length} entries`;
}

/* =============================================
   API HELPER
============================================= */
async function callApi(url, body = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(err.error || 'Có lỗi xảy ra');
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(err);
    alert('Không kết nối được server');
    return null;
  }
}

/* =============================================
   LOAD INITIAL STATE
============================================= */
async function loadInitialState() {
  const res = await fetch('/api/status');
  const data = await res.json();
  renderState(data);
}

/* =============================================
   BUTTON EVENTS
============================================= */
document.querySelectorAll('button[data-device]').forEach((button) => {
  button.addEventListener('click', async () => {
    await callApi(`/api/control/${button.dataset.device}`, { action: button.dataset.action });
  });
});

el.simulateBtn.addEventListener('click', async () => {
  await callApi('/api/simulate', {
    temperature: Number(el.inputTemperature.value),
    light:       Number(el.inputLight.value),
    smoke:       Number(el.inputSmoke.value)
  });
});


/* =============================================
   SOCKET.IO
============================================= */
const socket = io();

socket.on('connect', () => {
  el.connectionStatus.innerHTML = '<span class="dot-status"></span><span>Connected</span>';
  el.connectionStatus.className = 'status-pill connected';
});

socket.on('disconnect', () => {
  el.connectionStatus.innerHTML = '<span class="dot-status"></span><span>Disconnected</span>';
  el.connectionStatus.className = 'status-pill disconnected';
});

socket.on('state:update', (state) => {
  renderState(state);
});

socket.on('sensorData', (data) => {
  if (!data) return;

  const time = new Date().toLocaleTimeString('vi-VN');
  const MAX_POINTS = 20;

  // Temperature chart
  chartTemp.data.labels.push(time);
  chartTemp.data.datasets[0].data.push(data.temperature);
  if (chartTemp.data.labels.length > MAX_POINTS) {
    chartTemp.data.labels.shift();
    chartTemp.data.datasets[0].data.shift();
  }
  chartTemp.update('none');

  // Light chart
  chartLight.data.labels.push(time);
  chartLight.data.datasets[0].data.push(data.light);
  if (chartLight.data.labels.length > MAX_POINTS) {
    chartLight.data.labels.shift();
    chartLight.data.datasets[0].data.shift();
  }
  chartLight.update('none');

  // Smoke chart
  chartSmoke.data.labels.push(time);
  chartSmoke.data.datasets[0].data.push(data.smoke);
  if (chartSmoke.data.labels.length > MAX_POINTS) {
    chartSmoke.data.labels.shift();
    chartSmoke.data.datasets[0].data.shift();
  }
  chartSmoke.update('none');
});
