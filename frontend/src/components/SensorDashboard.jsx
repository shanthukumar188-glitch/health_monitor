import React, { useState, useEffect, useRef } from 'react';
import {
  Heart, Thermometer, Wind, Zap, Activity, Cpu, Wifi, WifiOff,
  AlertTriangle, Brain
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area
} from 'recharts';

const MAX_POINTS = 30;

function GaugeCard({ label, value, unit, min, max, normalMin, normalMax, color, icon: Icon, decimals = 0 }) {
  const isNormal = value >= normalMin && value <= normalMax;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const statusColor = value === null ? 'gray' : isNormal ? 'emerald' : 'red';

  return (
    <div className={`card border-${statusColor}-800/30`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl bg-${color}-900/30`}>
            <Icon className={`w-4 h-4 text-${color}-400`} />
          </div>
          <span className="text-sm text-gray-400">{label}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
          ${value === null ? 'bg-gray-800 text-gray-500' :
            isNormal ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400 animate-pulse'}`}>
          {value === null ? 'No Data' : isNormal ? 'Normal' : 'Alert'}
        </span>
      </div>
      <div className="flex items-end gap-2 mb-3">
        <span className={`text-3xl font-bold text-${value === null ? 'gray-600' : color}-400`}>
          {value !== null ? value.toFixed(decimals) : '--'}
        </span>
        <span className="text-gray-500 text-sm mb-1">{unit}</span>
      </div>
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 bg-${value === null ? 'gray' : isNormal ? 'emerald' : 'red'}-500`}
          style={{ width: `${value !== null ? pct : 0}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{min}{unit}</span>
        <span className="text-gray-500">Normal: {normalMin}-{normalMax}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export default function SensorDashboard({ socket, sensorData }) {
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [manualAlertState, setManualAlertState] = useState({ loading: false, message: '', error: false });
  const demoRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    if (sensorData && Object.keys(sensorData).length > 0) {
      setLastUpdate(new Date());
      setHistory((prev) => {
        const point = {
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          heartRate: sensorData.heartRate ?? null,
          spo2: sensorData.spo2 ?? null,
          temperature: sensorData.temperature ?? null,
          gsrValue: sensorData.gsrValue ?? null,
        };
        return [...prev.slice(-MAX_POINTS + 1), point];
      });
    }
  }, [sensorData]);

  const startDemo = () => {
    setDemoMode(true);
    let t = 0;
    demoRef.current = setInterval(() => {
      t++;
      const simulated = {
        heartRate: Math.round(72 + Math.sin(t * 0.2) * 8 + (Math.random() - 0.5) * 4),
        spo2: parseFloat((97.5 + Math.sin(t * 0.1) * 0.8 + (Math.random() - 0.5) * 0.5).toFixed(1)),
        temperature: parseFloat((36.8 + Math.sin(t * 0.05) * 0.3 + (Math.random() - 0.5) * 0.1).toFixed(1)),
        gsrValue: Math.round(400 + Math.sin(t * 0.3) * 100 + Math.random() * 50),
        accelX: parseFloat((Math.sin(t * 0.5) * 0.1).toFixed(3)),
        accelY: parseFloat((Math.cos(t * 0.5) * 0.1).toFixed(3)),
        accelZ: parseFloat((9.8 + (Math.random() - 0.5) * 0.2).toFixed(3)),
        steps: Math.floor(t * 0.3),
        batteryLevel: Math.max(20, 95 - Math.floor(t * 0.05)),
      };

      if (socket) socket.emit('sensor_data', simulated);
      setLastUpdate(new Date());
      setHistory((prev) => {
        const point = {
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          ...simulated,
        };
        return [...prev.slice(-MAX_POINTS + 1), point];
      });
    }, 1000);
  };

  const stopDemo = () => {
    setDemoMode(false);
    if (demoRef.current) clearInterval(demoRef.current);
  };

  const triggerManualAlert = async () => {
    setManualAlertState({ loading: true, message: '', error: false });

    try {
      const res = await fetch('http://localhost:3001/api/sensors/manual-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Manual alert failed');
      }

      const smsText = data.sms?.success
        ? 'SMS sent successfully.'
        : data.sms?.body
          ? 'SMS preview generated. Twilio is not configured.'
          : 'Alert triggered.';
      const locationText = data.hasLocation ? ' Location included.' : ' Location unavailable.';

      setManualAlertState({
        loading: false,
        message: `${smsText}${locationText}`,
        error: false,
      });
    } catch (error) {
      setManualAlertState({
        loading: false,
        message: error.message || 'Manual alert failed',
        error: true,
      });
    }
  };

  useEffect(() => () => {
    if (demoRef.current) clearInterval(demoRef.current);
  }, []);

  const sd = sensorData || {};

  const stressLevel = sd.gsrValue
    ? sd.gsrValue < 300 ? { label: 'Relaxed', color: 'emerald' }
    : sd.gsrValue < 600 ? { label: 'Moderate', color: 'yellow' }
    : { label: 'High Stress', color: 'red' }
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title mb-1"><Cpu className="w-5 h-5 text-blue-400" /> ESP32-S3 Wearable Dashboard</h2>
            <p className="text-gray-500 text-xs">MAX30102 • MLX90614 • MPU6050 • GSR • TCA9548A</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                Updated: {lastUpdate.toLocaleTimeString('en-IN')}
              </span>
            )}
            {connected ? (
              <span className="flex items-center gap-1.5 badge-green"><Wifi className="w-3.5 h-3.5" /> ESP32 Connected</span>
            ) : (
              <span className="flex items-center gap-1.5 badge-red"><WifiOff className="w-3.5 h-3.5" /> Not Connected</span>
            )}
            {sd.batteryLevel && (
              <span className={`badge-${sd.batteryLevel > 50 ? 'green' : sd.batteryLevel > 20 ? 'yellow' : 'red'}`}>
                Battery {sd.batteryLevel}%
              </span>
            )}
            {!demoMode ? (
              <button onClick={startDemo} className="btn-primary text-xs py-1.5 bg-blue-600">
                <Activity className="w-3.5 h-3.5" /> Demo Mode
              </button>
            ) : (
              <button onClick={stopDemo} className="btn-secondary text-xs py-1.5 text-red-400">
                Stop Demo
              </button>
            )}
            <button
              onClick={triggerManualAlert}
              disabled={manualAlertState.loading}
              className="btn-primary text-xs py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {manualAlertState.loading ? 'Sending...' : 'Send Test Alert'}
            </button>
          </div>
        </div>
        {manualAlertState.message && (
          <div className={`mt-3 text-xs ${manualAlertState.error ? 'text-red-400' : 'text-emerald-400'}`}>
            {manualAlertState.message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GaugeCard label="Heart Rate" value={sd.heartRate ?? null} unit=" BPM"
          min={30} max={180} normalMin={60} normalMax={100} color="red" icon={Heart} />
        <GaugeCard label="SpO2" value={sd.spo2 ?? null} unit="%"
          min={80} max={100} normalMin={95} normalMax={100} color="blue" icon={Wind} decimals={1} />
        <GaugeCard label="Body Temp" value={sd.temperature ?? null} unit=" C"
          min={34} max={41} normalMin={36.1} normalMax={37.2} color="orange" icon={Thermometer} decimals={1} />
        <GaugeCard label="GSR (Stress)" value={sd.gsrValue ?? null} unit=""
          min={0} max={1023} normalMin={0} normalMax={700} color="purple" icon={Zap} />
      </div>

      {stressLevel && (
        <div className={`card border-${stressLevel.color}-800/30 bg-${stressLevel.color}-900/10`}>
          <div className="flex items-center gap-3">
            <Brain className={`w-6 h-6 text-${stressLevel.color}-400`} />
            <div>
              <p className="text-sm text-gray-400">Stress Level (from GSR Sensor)</p>
              <p className={`font-bold text-${stressLevel.color}-400`}>{stressLevel.label}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-gray-500">GSR Raw Value</p>
              <p className="text-lg font-bold text-white">{sd.gsrValue}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" /> Heart Rate History
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[40, 140]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <ReferenceLine y={60} stroke="#10b981" strokeDasharray="3 3" label={{ value: '60', fill: '#10b981', fontSize: 10 }} />
              <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '100', fill: '#f59e0b', fontSize: 10 }} />
              <Area type="monotone" dataKey="heartRate" stroke="#ef4444" fill="url(#hrGrad)" strokeWidth={2} dot={false} name="BPM" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Wind className="w-4 h-4 text-blue-400" /> SpO2 History
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[85, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <ReferenceLine y={95} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '95%', fill: '#f59e0b', fontSize: 10 }} />
              <Area type="monotone" dataKey="spo2" stroke="#3b82f6" fill="url(#spo2Grad)" strokeWidth={2} dot={false} name="SpO2 %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-orange-400" /> Temperature History
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[35, 40]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <ReferenceLine y={37.5} stroke="#ef4444" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={false} name="C" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" /> GSR / Stress History
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="gsrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 1023]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <ReferenceLine y={700} stroke="#f59e0b" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="gsrValue" stroke="#a855f7" fill="url(#gsrGrad)" strokeWidth={2} dot={false} name="GSR" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {(sd.accelX !== undefined || sd.accelY !== undefined) && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" /> MPU6050 Accelerometer / Gyroscope
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Accel X', value: sd.accelX, color: 'red' },
              { label: 'Accel Y', value: sd.accelY, color: 'green' },
              { label: 'Accel Z', value: sd.accelZ, color: 'blue' },
              { label: 'Gyro X', value: sd.gyroX, color: 'orange' },
              { label: 'Gyro Y', value: sd.gyroY, color: 'purple' },
              { label: 'Gyro Z', value: sd.gyroZ, color: 'pink' },
            ].map((ax) => (
              <div key={ax.label} className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{ax.label}</p>
                <p className={`text-base font-bold text-${ax.color}-400`}>
                  {ax.value !== undefined && ax.value !== null ? ax.value.toFixed(3) : '--'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(sd).length === 0 && !demoMode && (
        <div className="card text-center py-12">
          <Cpu className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-300 font-semibold mb-2">Waiting for ESP32 Wearable</p>
          <p className="text-gray-500 text-sm mb-6 max-w-lg mx-auto">
            You can still test alerts without hardware using the dashboard button below.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={startDemo} className="btn-primary">
              <Activity className="w-4 h-4" /> Try Demo Mode
            </button>
            <button
              onClick={triggerManualAlert}
              disabled={manualAlertState.loading}
              className="btn-primary bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-4 h-4" />
              {manualAlertState.loading ? 'Sending...' : 'Send Test Alert'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
