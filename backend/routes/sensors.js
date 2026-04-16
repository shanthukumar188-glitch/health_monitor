/**
 * FILE: backend/routes/sensors.js
 *
 * HTTP endpoint for ESP32 to POST sensor data.
 * Anomaly detection now includes live location in SMS.
 */
const express = require('express');
const router  = express.Router();

let latestData    = {};
let lastAlertTime = 0;
const ALERT_COOLDOWN = 60000;

// ── ESP32 connectivity test ────────────────────────────────────────────────
router.get('/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'ESP32 can reach backend!',
    timestamp: new Date(),
    serverUrl: process.env.SERVER_URL || 'http://localhost:3001'
  });
});

// ── ESP32 POSTs sensor data here ───────────────────────────────────────────
router.post('/data', (req, res) => {
  try {
    const data = req.body;
    const io   = req.app.get('io');
    const state = req.app.get('sharedState') || {};

    console.log('📨 ESP32 Data received:', {
      hr: data.heartRate, spo2: data.spo2, temp: data.temperature, 
      gsr: data.gsrValue, steps: data.steps, battery: data.battery
    });

    const payload = {
      heartRate:      data.heartRate    ?? data.hr   ?? null,
      spo2:           data.spo2         ?? data.SpO2 ?? null,
      temperature:    data.temperature  ?? data.temp ?? null,
      gsrValue:       data.gsrValue     ?? data.gsr  ?? null,
      gsrResistance:  data.gsrResistance ?? null,
      accelX:         data.accelX  ?? null,
      accelY:         data.accelY  ?? null,
      accelZ:         data.accelZ  ?? null,
      gyroX:          data.gyroX   ?? null,
      gyroY:          data.gyroY   ?? null,
      gyroZ:          data.gyroZ   ?? null,
      steps:          data.steps   ?? null,
      batteryLevel:   data.battery ?? null,
      timestamp:      new Date(),
    };

    latestData = payload;
    if (io) {
      console.log(`🔥 Broadcasting sensor_update to all clients`);
      io.emit('sensor_update', payload);
    } else {
      console.warn('⚠️  Socket.io not available!');
    }

    // Anomaly detection with live-location SMS
    const alerts = [];
    if (payload.heartRate && (payload.heartRate < 50 || payload.heartRate > 120))
      alerts.push(`❤️ Heart Rate: ${payload.heartRate} BPM (normal 60-100)`);
    if (payload.spo2 && payload.spo2 < 95)
      alerts.push(`🫁 SpO2: ${payload.spo2}% — LOW (normal ≥95%)`);
    if (payload.temperature && (payload.temperature < 35.0 || payload.temperature > 38.5))
      alerts.push(`🌡️ Body Temp: ${payload.temperature}°C — ABNORMAL`);
    if (payload.gsrValue && payload.gsrValue > 800)
      alerts.push(`⚡ High Stress (GSR: ${payload.gsrValue})`);

    if (alerts.length > 0) {
      if (io) io.emit('health_alert', { alerts, timestamp: new Date() });

      const now = Date.now();
      if (now - lastAlertTime > ALERT_COOLDOWN) {
        lastAlertTime = now;
        console.log(`🚨 Triggering SMS alert for alerts:`, alerts);

        // POST to SMS route with location attached
        const fetch = require('node-fetch');
        fetch(`http://localhost:${process.env.PORT || 3001}/api/sms/alert-with-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alerts, location: state.lastLocation || null }),
        }).then(res => {
          console.log(`✅ SMS trigger response: ${res.status}`);
          return res.json();
        }).then(data => {
          console.log(`📱 SMS result:`, data);
        }).catch(e => console.error('❌ SMS trigger error:', e.message));
      } else {
        const cooldownLeft = Math.round((ALERT_COOLDOWN - (now - lastAlertTime)) / 1000);
        console.log(`⏱️  Alert cooldown active (${cooldownLeft}s remaining)`);
      }
    }

    res.json({ success: true, received: payload, alerts });
  } catch (e) {
    console.error('Sensor data error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Latest sensor snapshot (polling fallback) ──────────────────────────────
router.get('/latest', (req, res) => res.json({ success: true, data: latestData }));

module.exports = router;
