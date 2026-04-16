/**
 * FILE: frontend/src/components/Reminders.jsx
 *
 * Water reminder + medicine reminder UI.
 * Sends config to backend, listens for reminder socket events.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Droplets, Pill, Plus, Trash2, Bell, BellOff, CheckCircle2,
  Clock, Loader2, Send, ToggleLeft, ToggleRight, AlertCircle,
  RefreshCw, History
} from 'lucide-react';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const INTERVALS = [30, 60, 90, 120, 180, 240];

function Badge({ children, color = 'blue' }) {
  const styles = {
    blue:   'bg-blue-900/30 text-blue-300 border border-blue-800/50',
    green:  'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50',
    yellow: 'bg-yellow-900/30 text-yellow-300 border border-yellow-800/50',
    red:    'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[color]}`}>{children}</span>;
}

export default function Reminders({ backend, socket }) {
  // ── Water state ──────────────────────────────────────────────────────────
  const [waterInterval, setWaterInterval] = useState(120);
  const [waterEnabled, setWaterEnabled]   = useState(false);
  const [waterSMS, setWaterSMS]           = useState(false);
  const [waterLoading, setWaterLoading]   = useState(false);

  // ── Medicine state ───────────────────────────────────────────────────────
  const [medicines, setMedicines]         = useState([]);
  const [newMed, setNewMed]               = useState({
    name: '', dose: '', time: '08:00', days: [0,1,2,3,4,5,6], smsAlert: true
  });
  const [medLoading, setMedLoading]       = useState(false);

  // ── Reminder log ─────────────────────────────────────────────────────────
  const [log, setLog]           = useState([]);
  const [lastFired, setLastFired] = useState(null);
  const [toast, setToast]       = useState(null);

  // ── Load existing reminders on mount ────────────────────────────────────
  useEffect(() => {
    fetchList();
  }, []);

  // ── Listen to socket reminder events ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      setLastFired(data);
      setLog(prev => [{ ...data, id: Date.now() }, ...prev].slice(0, 30));
      showToast(data);
    };
    socket.on('reminder', handler);
    return () => socket.off('reminder', handler);
  }, [socket]);

  function showToast(data) {
    setToast(data);
    setTimeout(() => setToast(null), 5000);
  }

  async function fetchList() {
    try {
      const r = await fetch(`${backend}/api/reminders/list`);
      const d = await r.json();
      if (d.success) {
        const water = d.reminders.find(r => r.type === 'water');
        if (water) {
          setWaterEnabled(water.enabled);
          setWaterInterval(water.intervalMinutes || 120);
          setWaterSMS(water.smsAlert || false);
        }
        setMedicines(d.reminders.filter(r => r.type === 'medicine'));
        setLog(d.log || []);
      }
    } catch (e) { console.error(e); }
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  async function saveWater() {
    setWaterLoading(true);
    try {
      const r = await fetch(`${backend}/api/reminders/water`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: waterInterval, enabled: waterEnabled, smsAlert: waterSMS }),
      });
      const d = await r.json();
      if (d.success) showToast({ type: 'water', message: `Water reminder ${waterEnabled ? 'set' : 'disabled'}` });
    } catch (e) { console.error(e); }
    finally { setWaterLoading(false); }
  }

  async function testWater() {
    await fetch(`${backend}/api/reminders/test/water`, { method: 'POST' });
    showToast({ type: 'water', message: 'Test water reminder fired!' });
  }

  // ── Medicine ──────────────────────────────────────────────────────────────
  function toggleDay(d) {
    setNewMed(prev => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter(x => x !== d) : [...prev.days, d].sort()
    }));
  }

  async function addMedicine() {
    if (!newMed.name.trim() || !newMed.time) return;
    setMedLoading(true);
    try {
      const r = await fetch(`${backend}/api/reminders/medicine`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMed),
      });
      const d = await r.json();
      if (d.success) {
        await fetchList();
        setNewMed({ name: '', dose: '', time: '08:00', days: [0,1,2,3,4,5,6], smsAlert: true });
        showToast({ type: 'medicine', message: `${newMed.name} reminder added!` });
      }
    } catch (e) { console.error(e); }
    finally { setMedLoading(false); }
  }

  async function deleteMedicine(id) {
    await fetch(`${backend}/api/reminders/${id}`, { method: 'DELETE' });
    setMedicines(prev => prev.filter(m => m.id !== id));
  }

  async function testMedicine(name, dose) {
    await fetch(`${backend}/api/reminders/test/medicine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dose }),
    });
    showToast({ type: 'medicine', message: `Test: Take ${name}` });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 relative">

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium flex items-center gap-2 transition-all
          ${toast.type === 'water' ? 'bg-blue-900 border-blue-700 text-blue-200' : 'bg-purple-900 border-purple-700 text-purple-200'}`}>
          {toast.type === 'water' ? <Droplets className="w-4 h-4" /> : <Pill className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* ── WATER REMINDER ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">
            <Droplets className="w-5 h-5 text-blue-400" /> Water Reminder
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{waterEnabled ? 'Active' : 'Off'}</span>
            <button onClick={() => setWaterEnabled(v => !v)} className="text-gray-400 hover:text-blue-400 transition-colors">
              {waterEnabled ? <ToggleRight className="w-7 h-7 text-blue-400" /> : <ToggleLeft className="w-7 h-7" />}
            </button>
          </div>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Sends a vibration + OLED alert on your wearable and optionally an SMS when it's time to drink water.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Reminder interval</label>
            <div className="flex flex-wrap gap-2">
              {INTERVALS.map(iv => (
                <button key={iv} onClick={() => setWaterInterval(iv)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all
                    ${waterInterval === iv ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-blue-500'}`}>
                  {iv < 60 ? `${iv}m` : `${iv/60}h`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3 border border-gray-700">
            <div className="flex-1">
              <p className="text-sm text-white font-medium">SMS alert on reminder</p>
              <p className="text-xs text-gray-400">Send SMS to {process.env.ALERT_PHONE || 'your phone'}</p>
            </div>
            <button onClick={() => setWaterSMS(v => !v)} className="text-gray-400 hover:text-blue-400 transition-colors">
              {waterSMS ? <ToggleRight className="w-7 h-7 text-blue-400" /> : <ToggleLeft className="w-7 h-7" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={saveWater} disabled={waterLoading}
            className="btn-primary bg-blue-600 hover:bg-blue-500">
            {waterLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {waterEnabled ? `Save (every ${waterInterval < 60 ? waterInterval+'m' : waterInterval/60+'h'})` : 'Save (disabled)'}
          </button>
          <button onClick={testWater} className="btn-secondary text-blue-400">
            <Send className="w-4 h-4" /> Test Now
          </button>
        </div>

        {waterEnabled && (
          <div className="mt-3 flex items-center gap-2 bg-blue-900/20 border border-blue-800/40 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-blue-300">
              Reminder active — every {waterInterval < 60 ? waterInterval + ' minutes' : (waterInterval/60) + ' hours'}
              {waterSMS ? ' · SMS enabled' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── MEDICINE REMINDER ───────────────────────────────────────────── */}
      <div className="card">
        <h2 className="section-title mb-1">
          <Pill className="w-5 h-5 text-purple-400" /> Medicine Reminders
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Set daily medicine reminders. Each fires a wearable vibration + OLED alert and an optional SMS at the scheduled time.
        </p>

        {/* Add new medicine form */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 mb-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Add medicine</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Medicine name *</label>
              <input type="text" placeholder="e.g. Metformin 500mg"
                value={newMed.name} onChange={e => setNewMed(p => ({ ...p, name: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Dose / instructions</label>
              <input type="text" placeholder="e.g. 1 tablet after food"
                value={newMed.dose} onChange={e => setNewMed(p => ({ ...p, dose: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Time *</label>
              <input type="time" value={newMed.time}
                onChange={e => setNewMed(p => ({ ...p, time: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Days of week</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium border transition-all
                      ${newMed.days.includes(i) ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-800 text-gray-400 border-gray-600 hover:border-purple-500'}`}>
                    {d[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={newMed.smsAlert}
                onChange={e => setNewMed(p => ({ ...p, smsAlert: e.target.checked }))}
                className="w-4 h-4 rounded accent-purple-500" />
              Send SMS reminder
            </label>
            <button onClick={addMedicine} disabled={medLoading || !newMed.name}
              className="btn-primary bg-purple-600 hover:bg-purple-500">
              {medLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Reminder
            </button>
          </div>
        </div>

        {/* Medicine list */}
        {medicines.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Pill className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No medicine reminders yet. Add one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {medicines.map(med => (
              <div key={med.id} className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-3 border border-gray-700">
                <div className="w-10 h-10 bg-purple-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Pill className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{med.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {med.time}
                    </span>
                    {med.dose && <Badge color="blue">{med.dose}</Badge>}
                    {med.smsAlert && <Badge color="green">SMS on</Badge>}
                    <span className="text-xs text-gray-500">
                      {med.days?.length === 7 ? 'Daily' : med.days?.map(d => DAYS[d][0]).join(' ')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => testMedicine(med.name, med.dose)} title="Test now"
                    className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-purple-400 transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteMedicine(med.id)} title="Delete"
                    className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── REMINDER LOG ───────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" /> Recent reminders
            </h3>
            <button onClick={() => setLog([])} className="text-xs text-gray-500 hover:text-red-400">Clear</button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {log.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                  ${entry.type === 'water' ? 'bg-blue-900/40' : 'bg-purple-900/40'}`}>
                  {entry.type === 'water' ? <Droplets className="w-3.5 h-3.5 text-blue-400" /> : <Pill className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate">{entry.message}</p>
                  <p className="text-xs text-gray-500">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-IN') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">How reminders reach you</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: '📱', title: 'Web notification', desc: 'Toast popup in the browser dashboard' },
            { icon: '⌚', title: 'OLED + vibration', desc: 'ESP32 wearable shows message and vibrates' },
            { icon: '💬', title: 'SMS (optional)', desc: 'Text to your phone via Twilio' },
          ].map(item => (
            <div key={item.title} className="bg-gray-800/50 rounded-xl p-3 border border-gray-700 text-center">
              <span className="text-2xl">{item.icon}</span>
              <p className="text-xs font-medium text-white mt-2">{item.title}</p>
              <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
