/**
 * FILE: backend/routes/sms.js
 *
 * SMS alerts via Twilio — now includes live location in alert messages.
 */
const express = require('express');
const router  = express.Router();

function getTwilio() {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth || sid === 'your_twilio_account_sid_here') return null;
  return require('twilio')(sid, auth);
}

// ── Generic alert (called by server.js anomaly detection) ──────────────────
router.post('/alert', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const client = getTwilio();
    const from   = process.env.TWILIO_PHONE_NUMBER;
    const to     = process.env.ALERT_PHONE_NUMBER;

    if (!client || !from || !to) {
      console.warn('⚠️  Twilio not configured — SMS skipped. Message was:\n', message);
      return res.json({ success: false, warning: 'Twilio not configured' });
    }

    const result = await client.messages.create({ body: message, from, to });
    console.log('📱 SMS sent:', result.sid);
    res.json({ success: true, sid: result.sid });
  } catch (e) {
    console.error('SMS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Location-aware health alert ────────────────────────────────────────────
// Called internally when sensor anomaly + location is available
router.post('/alert-with-location', async (req, res) => {
  try {
    const { alerts = [], location } = req.body;
    const client = getTwilio();
    const from   = process.env.TWILIO_PHONE_NUMBER;
    const to     = process.env.ALERT_PHONE_NUMBER;

    let body = `🚨 Health Alert from wearable:\n`;
    body += alerts.join('\n');
    body += `\nTime: ${new Date().toLocaleString('en-IN')}`;

    if (location && location.lat) {
      const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lon}`;
      body += `\n\n📍 Live Location:\n${mapsUrl}`;
      if (location.accuracy) body += `\n(Accuracy: ±${Math.round(location.accuracy)}m)`;
    } else {
      body += `\n\n📍 Location unavailable`;
    }

    if (!client || !from || !to) {
      console.warn('Twilio not configured. Would have sent:\n', body);
      return res.json({ success: false, warning: 'Twilio not configured', body });
    }

    const result = await client.messages.create({ body, from, to });
    res.json({ success: true, sid: result.sid });
  } catch (e) {
    console.error('SMS alert-with-location error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Send medicine reminder SMS ─────────────────────────────────────────────
router.post('/medicine-reminder', async (req, res) => {
  try {
    const { name, dose, time } = req.body;
    const client = getTwilio();
    const from   = process.env.TWILIO_PHONE_NUMBER;
    const to     = process.env.ALERT_PHONE_NUMBER;

    const body = `💊 Medicine Reminder:\nTime to take ${name}${dose ? '\nDose: ' + dose : ''}\nScheduled time: ${time || 'Now'}`;

    if (!client || !from || !to) {
      return res.json({ success: false, warning: 'Twilio not configured' });
    }
    const result = await client.messages.create({ body, from, to });
    res.json({ success: true, sid: result.sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Test SMS endpoint ──────────────────────────────────────────────────────
router.get('/test', async (req, res) => {
  try {
    const client = getTwilio();
    const from   = process.env.TWILIO_PHONE_NUMBER;
    const to     = process.env.ALERT_PHONE_NUMBER;

    if (!client || !from || !to) {
      return res.json({ success: false, message: 'Twilio credentials not configured in .env' });
    }
    await client.messages.create({
      body: '✅ HealthMonitor SMS test OK! Alerts (with live location) are active.',
      from, to,
    });
    res.json({ success: true, message: 'Test SMS sent!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
