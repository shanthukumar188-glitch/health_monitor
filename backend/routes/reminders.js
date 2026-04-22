const express  = require('express');
const router   = express.Router();
const cron     = require('node-cron');
const { v4: uuid } = require('uuid');

const reminders = [];
const pendingQueue = [];
const reminderLog = [];

function pushPending(type, message, icon) {
  pendingQueue.push({ id: uuid(), type, message, icon, timestamp: new Date() });
  reminderLog.unshift({ type, message, icon, timestamp: new Date() });
  if (reminderLog.length > 50) reminderLog.pop();
}

async function sendSMS(message) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to   = process.env.ALERT_PHONE_NUMBER;

  if (!sid || !auth || !from || !to) {
    return { success: false, reason: 'not_configured' };
  }

  const twilio = require('twilio')(sid, auth);

  try {
    const result = await twilio.messages.create({ body: message, from, to });
    console.log('SMS sent:', result.sid);
    return { success: true, sid: result.sid };
  } catch (e) {
    console.error('SMS error:', e.message);
    return { success: false, reason: 'send_failed', error: e.message };
  }
}

function minutesToCron(minutes) {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function timeToCron(timeStr, days) {
  const [h, m] = timeStr.split(':');
  const dayStr = days && days.length < 7 ? days.join(',') : '*';
  return `${parseInt(m, 10)} ${parseInt(h, 10)} * * ${dayStr}`;
}

function emitReminder(req, payload) {
  const io = req.app.get('io');
  if (io) io.emit('reminder', payload);
}

router.post('/water', (req, res) => {
  try {
    const { intervalMinutes = 120, enabled = true, smsAlert = false } = req.body;

    const existing = reminders.findIndex((r) => r.type === 'water');
    if (existing !== -1) {
      reminders[existing].cronJob && reminders[existing].cronJob.destroy();
      reminders.splice(existing, 1);
    }

    if (!enabled) return res.json({ success: true, message: 'Water reminder disabled' });

    const cronExpr = minutesToCron(parseInt(intervalMinutes, 10));
    const id = uuid();

    const cronJob = cron.schedule(cronExpr, () => {
      const message = `Drink Water! Stay hydrated. (Every ${intervalMinutes} min)`;
      console.log('Water reminder fired');

      pushPending('water', message, 'W');
      emitReminder(req, { type: 'water', message, timestamp: new Date() });

      if (smsAlert) {
        sendSMS(`Water Reminder: Time to drink water! Stay hydrated.\nEvery ${intervalMinutes} minutes reminder.`);
      }
    });

    reminders.push({ id, type: 'water', name: 'Water reminder', intervalMinutes, cronExpr, enabled: true, smsAlert, cronJob });

    console.log(`Water reminder set: every ${intervalMinutes} min (${cronExpr})`);
    res.json({ success: true, id, intervalMinutes, cronExpr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/medicine', (req, res) => {
  try {
    const {
      name,
      dose = '',
      time,
      days = [0, 1, 2, 3, 4, 5, 6],
      enabled = true,
      smsAlert = true,
    } = req.body;

    if (!name || !time) return res.status(400).json({ error: 'name and time are required' });

    const cronExpr = timeToCron(time, days);
    const id = uuid();

    const cronJob = cron.schedule(cronExpr, () => {
      const message = `Take ${name}${dose ? ' · ' + dose : ''}`;
      console.log(`Medicine reminder: ${message}`);

      pushPending('medicine', message, 'M');
      emitReminder(req, { type: 'medicine', message, name, dose, timestamp: new Date() });

      if (smsAlert) {
        sendSMS(`Medicine Reminder:\nTime to take ${name}${dose ? '\nDose: ' + dose : ''}\nScheduled: ${time}`);
      }
    });

    reminders.push({ id, type: 'medicine', name, dose, time, days, cronExpr, enabled, smsAlert, cronJob });

    console.log(`Medicine reminder set: ${name} at ${time} (${cronExpr})`);
    res.json({ success: true, id, name, time, cronExpr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/list', (req, res) => {
  const safe = reminders.map(({ cronJob, ...rest }) => rest);
  res.json({ success: true, reminders: safe, log: reminderLog.slice(0, 20) });
});

router.delete('/:id', (req, res) => {
  const idx = reminders.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  reminders[idx].cronJob && reminders[idx].cronJob.destroy();
  reminders.splice(idx, 1);
  res.json({ success: true });
});

router.patch('/:id/toggle', (req, res) => {
  const reminder = reminders.find((r) => r.id === req.params.id);
  if (!reminder) return res.status(404).json({ error: 'Not found' });
  reminder.enabled = !reminder.enabled;
  reminder.enabled ? reminder.cronJob.start() : reminder.cronJob.stop();
  res.json({ success: true, enabled: reminder.enabled });
});

router.get('/pending', (req, res) => {
  const items = [...pendingQueue];
  pendingQueue.length = 0;
  res.json({ success: true, count: items.length, items });
});

router.post('/ack', (req, res) => {
  const { id } = req.body;
  console.log(`ESP32 acknowledged reminder: ${id}`);
  res.json({ success: true });
});

router.post('/test/:type', async (req, res) => {
  try {
    const type = req.params.type;
    let sms = { success: false, reason: 'disabled' };

    if (type === 'water') {
      const { smsAlert = false } = req.body || {};
      const message = 'Test: Drink Water! Stay hydrated.';
      pushPending('water', message, 'W');
      emitReminder(req, { type, message, timestamp: new Date() });

      if (smsAlert) {
        sms = await sendSMS('Test Water Reminder: Time to drink water! Stay hydrated.');
      }
    } else if (type === 'medicine') {
      const { name = 'Test Medicine', dose = '1 tablet', smsAlert = false } = req.body || {};
      const message = `Take ${name}${dose ? ' · ' + dose : ''}`;
      pushPending('medicine', message, 'M');
      emitReminder(req, { type, message, name, dose, timestamp: new Date() });

      if (smsAlert) {
        sms = await sendSMS(`Test Medicine Reminder:\nTime to take ${name}${dose ? '\nDose: ' + dose : ''}`);
      }
    } else {
      return res.status(400).json({ success: false, error: 'Unknown reminder type' });
    }

    res.json({ success: true, message: `Test ${type} reminder fired`, sms });
  } catch (e) {
    console.error('Test reminder error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
