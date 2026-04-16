/**
 * FILE: backend/routes/reminders.js
 *
 * Handles water reminders, medicine reminders, OLED push queue,
 * and the /pending endpoint that ESP32 polls every 5 seconds.
 */
const express  = require('express');
const router   = express.Router();
const cron     = require('node-cron');
const { v4: uuid } = require('uuid');

// ── In-memory stores ────────────────────────────────────────────────────────
const reminders      = [];   // { id, type, name, dose, cronExpr, enabled, cronJob }
const pendingQueue   = [];   // items waiting for ESP32 to pick up
const reminderLog    = [];   // last 50 fired reminders

// ── Helpers ─────────────────────────────────────────────────────────────────
function pushPending(type, message, icon) {
  pendingQueue.push({ id: uuid(), type, message, icon, timestamp: new Date() });
  reminderLog.unshift({ type, message, icon, timestamp: new Date() });
  if (reminderLog.length > 50) reminderLog.pop();
}

function sendSMS(message) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to   = process.env.ALERT_PHONE_NUMBER;
  if (!sid || !auth || !from || !to) return;
  const twilio = require('twilio')(sid, auth);
  twilio.messages.create({ body: message, from, to })
    .then(m => console.log('📱 SMS sent:', m.sid))
    .catch(e => console.error('SMS error:', e.message));
}

function minutesToCron(minutes) {
  // e.g. every 30 min → "*/30 * * * *", every 60 → "0 * * * *", every 120 → "0 */2 * * *"
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function timeToCron(timeStr, days) {
  // timeStr = "08:30", days = [0,1,2,3,4,5,6] (0=Sun)
  const [h, m] = timeStr.split(':');
  const dayStr = days && days.length < 7 ? days.join(',') : '*';
  return `${parseInt(m)} ${parseInt(h)} * * ${dayStr}`;
}

// ── WATER REMINDER ──────────────────────────────────────────────────────────
router.post('/water', (req, res) => {
  try {
    const { intervalMinutes = 120, enabled = true, smsAlert = false } = req.body;

    // Remove existing water reminder
    const existing = reminders.findIndex(r => r.type === 'water');
    if (existing !== -1) {
      reminders[existing].cronJob && reminders[existing].cronJob.destroy();
      reminders.splice(existing, 1);
    }

    if (!enabled) return res.json({ success: true, message: 'Water reminder disabled' });

    const cronExpr = minutesToCron(parseInt(intervalMinutes));
    const id = uuid();

    const cronJob = cron.schedule(cronExpr, () => {
      const message = `Drink Water! Stay hydrated. (Every ${intervalMinutes} min)`;
      console.log(`💧 Water reminder fired`);

      // Push to ESP32 queue
      pushPending('water', message, 'W');

      // Emit to all browser clients
      const io = global._io;
      if (io) io.emit('reminder', { type: 'water', message, timestamp: new Date() });

      // Optional SMS
      if (smsAlert) {
        sendSMS(`💧 Water Reminder: Time to drink water! Stay hydrated.\nEvery ${intervalMinutes} minutes reminder.`);
      }
    });

    reminders.push({ id, type: 'water', name: 'Water reminder', intervalMinutes, cronExpr, enabled: true, smsAlert, cronJob });

    console.log(`💧 Water reminder set: every ${intervalMinutes} min (${cronExpr})`);
    res.json({ success: true, id, intervalMinutes, cronExpr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── MEDICINE REMINDER ───────────────────────────────────────────────────────
router.post('/medicine', (req, res) => {
  try {
    const {
      name,                          // medicine name e.g. "Metformin 500mg"
      dose    = '',                  // e.g. "1 tablet"
      time,                          // e.g. "08:30"
      days    = [0,1,2,3,4,5,6],    // days of week (0=Sun…6=Sat)
      enabled = true,
      smsAlert = true,
    } = req.body;

    if (!name || !time) return res.status(400).json({ error: 'name and time are required' });

    const cronExpr = timeToCron(time, days);
    const id = uuid();

    const cronJob = cron.schedule(cronExpr, () => {
      const message = `Take ${name}${dose ? ' · ' + dose : ''}`;
      console.log(`💊 Medicine reminder: ${message}`);

      pushPending('medicine', message, 'M');

      const io = global._io;
      if (io) io.emit('reminder', { type: 'medicine', message, name, dose, timestamp: new Date() });

      if (smsAlert) {
        sendSMS(`💊 Medicine Reminder:\nTime to take ${name}${dose ? '\nDose: ' + dose : ''}\nScheduled: ${time}`);
      }
    });

    reminders.push({ id, type: 'medicine', name, dose, time, days, cronExpr, enabled, smsAlert, cronJob });

    console.log(`💊 Medicine reminder set: ${name} at ${time} (${cronExpr})`);
    res.json({ success: true, id, name, time, cronExpr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── LIST all reminders ──────────────────────────────────────────────────────
router.get('/list', (req, res) => {
  const safe = reminders.map(({ cronJob, ...rest }) => rest);
  res.json({ success: true, reminders: safe, log: reminderLog.slice(0, 20) });
});

// ── DELETE a reminder ───────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const idx = reminders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  reminders[idx].cronJob && reminders[idx].cronJob.destroy();
  reminders.splice(idx, 1);
  res.json({ success: true });
});

// ── TOGGLE enable/disable ───────────────────────────────────────────────────
router.patch('/:id/toggle', (req, res) => {
  const r = reminders.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  r.enabled = !r.enabled;
  r.enabled ? r.cronJob.start() : r.cronJob.stop();
  res.json({ success: true, enabled: r.enabled });
});

// ── PENDING queue — ESP32 polls this every 5 seconds ───────────────────────
router.get('/pending', (req, res) => {
  const items = [...pendingQueue];
  pendingQueue.length = 0;   // clear after sending (one-shot delivery)
  res.json({ success: true, count: items.length, items });
});

// ── ACK from ESP32 (optional, for logging) ──────────────────────────────────
router.post('/ack', (req, res) => {
  const { id } = req.body;
  console.log(`✅ ESP32 acknowledged reminder: ${id}`);
  res.json({ success: true });
});

// ── Manual test fire ────────────────────────────────────────────────────────
router.post('/test/:type', (req, res) => {
  const type = req.params.type;
  if (type === 'water') {
    pushPending('water', 'Test: Drink Water! Stay hydrated.', 'W');
  } else if (type === 'medicine') {
    const { name = 'Test Medicine', dose = '1 tablet' } = req.body;
    pushPending('medicine', `Take ${name} · ${dose}`, 'M');
  }
  const io = global._io;
  if (io) io.emit('reminder', { type, message: 'Test reminder fired', timestamp: new Date() });
  res.json({ success: true, message: `Test ${type} reminder fired` });
});

module.exports = router;
