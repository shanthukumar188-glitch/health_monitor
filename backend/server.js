const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const medicalRouter   = require('./routes/medical');
const chatRouter      = require('./routes/chat');
const hospitalsRouter = require('./routes/hospitals');
const smsRouter       = require('./routes/sms');
const sensorsRouter   = require('./routes/sensors');
const remindersRouter = require('./routes/reminders');

const app    = express();
const server = http.createServer(app);

// ✅ FIXED SOCKET.IO CORS (allow all for ESP)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ FIXED EXPRESS CORS (important)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Shared state ──────────────────────────────────
const sharedState = {
  lastLocation: null,
  lastAlertTime: 0,
};

app.set('io', io);
app.set('sharedState', sharedState);

// ── Routes ─────────────────────────────────────────
app.use('/api/medical',    medicalRouter);
app.use('/api/chat',       chatRouter);
app.use('/api/hospitals',  hospitalsRouter);
app.use('/api/sms',        smsRouter);
app.use('/api/sensors',    sensorsRouter);
app.use('/api/reminders',  remindersRouter);

// ✅ TEST ROUTE (VERY IMPORTANT)
app.get('/', (req, res) => {
  res.send("🚀 Backend running successfully");
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ── Anomaly detection ─────────────────────────────
const ALERT_COOLDOWN = 60000;

function checkAnomalies(data) {
  const alerts = [];

  if (data.heartRate && (data.heartRate < 50 || data.heartRate > 120))
    alerts.push(`Heart Rate ${data.heartRate} BPM`);

  if (data.spo2 && data.spo2 < 95)
    alerts.push(`Low SpO2 ${data.spo2}%`);

  if (data.temperature && (data.temperature < 35 || data.temperature > 38.5))
    alerts.push(`Abnormal Temp ${data.temperature}`);

  if (data.gsrValue && data.gsrValue > 800)
    alerts.push(`High Stress ${data.gsrValue}`);

  if (alerts.length > 0) {
    io.emit('health_alert', { alerts, timestamp: new Date() });

    const now = Date.now();
    if (now - sharedState.lastAlertTime > ALERT_COOLDOWN) {
      sharedState.lastAlertTime = now;

      const fetchFn = require('node-fetch');

      fetchFn(`http://localhost:${process.env.PORT || 3001}/api/sms/alert-with-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alerts,
          location: sharedState.lastLocation || null,
          source: 'socket',
        }),
      })
        .then(res => res.json())
        .then(result => console.log('Socket alert SMS result:', result))
        .catch(e => console.error('SMS error:', e.message));
    }
  }
}

// ── Socket.io ─────────────────────────────────────
io.on('connection', socket => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('sensor_data', data => {
    io.emit('sensor_update', { ...data, timestamp: new Date() });
    checkAnomalies(data);
  });

  socket.on('location_update', loc => {
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      sharedState.lastLocation = { ...loc, timestamp: new Date() };
      console.log('Location updated:', sharedState.lastLocation);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
  });
});

// ✅ 🔥 MOST IMPORTANT FIX HERE
const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ Server running on: http://0.0.0.0:${PORT}`);
  console.log(`🌐 Access via: http://YOUR_IP:${PORT}`);
});
