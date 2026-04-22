const express = require('express');
const router = express.Router();

function getTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth || sid === 'your_twilio_account_sid_here') return null;
  return require('twilio')(sid, auth);
}

function getSmsConfig() {
  return {
    client: getTwilio(),
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.ALERT_PHONE_NUMBER,
  };
}

function buildLocationSection(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    return '\n\nLocation unavailable';
  }

  let section = `\n\nLive Location:\nhttps://maps.google.com/?q=${location.lat},${location.lon}`;
  if (location.accuracy) {
    section += `\n(Accuracy: +/-${Math.round(location.accuracy)}m)`;
  }
  if (location.timestamp) {
    section += `\nUpdated: ${new Date(location.timestamp).toLocaleString('en-IN')}`;
  }
  return section;
}

function buildAlertWithLocationBody(alerts = [], location) {
  let body = 'Health Alert from wearable:\n';
  body += alerts.join('\n');
  body += `\nTime: ${new Date().toLocaleString('en-IN')}`;
  body += buildLocationSection(location);
  return body;
}

router.post('/alert', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const { client, from, to } = getSmsConfig();
    if (!client || !from || !to) {
      console.warn('Twilio not configured. SMS skipped. Message was:\n', message);
      return res.json({ success: false, warning: 'Twilio not configured' });
    }

    const result = await client.messages.create({ body: message, from, to });
    console.log('SMS sent:', result.sid);
    res.json({ success: true, sid: result.sid });
  } catch (e) {
    console.error('SMS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/alert-with-location', async (req, res) => {
  try {
    const { alerts = [], location } = req.body;
    const sharedState = req.app.get('sharedState') || {};
    const effectiveLocation = location || sharedState.lastLocation || null;
    const { client, from, to } = getSmsConfig();
    const body = buildAlertWithLocationBody(alerts, effectiveLocation);

    if (!client || !from || !to) {
      console.warn('Twilio not configured. Would have sent:\n', body);
      return res.json({ success: false, warning: 'Twilio not configured', body });
    }

    const result = await client.messages.create({ body, from, to });
    console.log('Location-aware SMS sent:', result.sid);
    res.json({
      success: true,
      sid: result.sid,
      hasLocation: !!(effectiveLocation && Number.isFinite(effectiveLocation.lat) && Number.isFinite(effectiveLocation.lon)),
    });
  } catch (e) {
    console.error('SMS alert-with-location error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/preview-alert-with-location', (req, res) => {
  try {
    const { alerts = [], location } = req.body;
    const sharedState = req.app.get('sharedState') || {};
    const effectiveLocation = location || sharedState.lastLocation || null;
    const body = buildAlertWithLocationBody(alerts, effectiveLocation);

    res.json({
      success: true,
      body,
      location: effectiveLocation,
      hasLocation: !!(effectiveLocation && Number.isFinite(effectiveLocation.lat) && Number.isFinite(effectiveLocation.lon)),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/last-location', (req, res) => {
  const sharedState = req.app.get('sharedState') || {};
  const lastLocation = sharedState.lastLocation || null;

  res.json({
    success: true,
    location: lastLocation,
    hasLocation: !!(lastLocation && Number.isFinite(lastLocation.lat) && Number.isFinite(lastLocation.lon)),
  });
});

router.post('/medicine-reminder', async (req, res) => {
  try {
    const { name, dose, time } = req.body;
    const { client, from, to } = getSmsConfig();
    const body = `Medicine Reminder:\nTime to take ${name}${dose ? '\nDose: ' + dose : ''}\nScheduled time: ${time || 'Now'}`;

    if (!client || !from || !to) {
      return res.json({ success: false, warning: 'Twilio not configured' });
    }

    const result = await client.messages.create({ body, from, to });
    console.log('Medicine SMS sent:', result.sid);
    res.json({ success: true, sid: result.sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/test', async (req, res) => {
  try {
    const sharedState = req.app.get('sharedState') || {};
    const { client, from, to } = getSmsConfig();

    if (!client || !from || !to) {
      return res.json({ success: false, message: 'Twilio credentials not configured in .env' });
    }

    const body = `HealthMonitor SMS test OK!\nTime: ${new Date().toLocaleString('en-IN')}${buildLocationSection(sharedState.lastLocation || null)}`;
    const result = await client.messages.create({ body, from, to });

    res.json({
      success: true,
      message: 'Test SMS sent!',
      sid: result.sid,
      hasLocation: !!(sharedState.lastLocation && Number.isFinite(sharedState.lastLocation.lat) && Number.isFinite(sharedState.lastLocation.lon)),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
