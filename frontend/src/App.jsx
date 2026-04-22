/**
 * FILE: frontend/src/App.jsx
 *
 * Main app — adds Reminders tab + continuous GPS location push to backend.
 */
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Activity, FileText, Microscope, MapPin, Cpu, MessageSquare,
  Footprints, Salad, Dumbbell, Bell, BellOff, Heart, Thermometer,
  Wind, Zap, Menu, X, AlarmClock
} from 'lucide-react';

import MedicalReport    from './components/MedicalReport.jsx';
import SkinAnalysis     from './components/SkinAnalysis.jsx';
import NearbyHospitals  from './components/NearbyHospitals.jsx';
import SensorDashboard  from './components/SensorDashboard.jsx';
import Chatbot          from './components/Chatbot.jsx';
import StepsTracker     from './components/StepsTracker.jsx';
import DietPlanner      from './components/DietPlanner.jsx';
import ExercisePlanner  from './components/ExercisePlanner.jsx';
import Reminders        from './components/Reminders.jsx';

const BACKEND = 'http://localhost:3001';

const TABS = [
  { id: 'dashboard',  label: 'Sensor Dashboard',   icon: Cpu,          color: 'text-blue-400' },
  { id: 'medical',    label: 'Medical Report',      icon: FileText,     color: 'text-green-400' },
  { id: 'skin',       label: 'Skin Analysis',       icon: Microscope,   color: 'text-pink-400' },
  { id: 'hospitals',  label: 'Nearby Hospitals',    icon: MapPin,       color: 'text-red-400' },
  { id: 'chat',       label: 'AI Health Chat',      icon: MessageSquare,color: 'text-purple-400' },
  { id: 'steps',      label: 'Steps Tracker',       icon: Footprints,   color: 'text-yellow-400' },
  { id: 'diet',       label: 'Diet Planner',        icon: Salad,        color: 'text-emerald-400' },
  { id: 'exercise',   label: 'Exercise Planner',    icon: Dumbbell,     color: 'text-orange-400' },
  { id: 'reminders',  label: 'Reminders',           icon: AlarmClock,   color: 'text-cyan-400' },
];

export default function App() {
  const [activeTab, setActiveTab]   = useState('dashboard');
  const [socket, setSocket]         = useState(null);
  const [sensorData, setSensorData] = useState({});
  const [alerts, setAlerts]         = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reminderToast, setReminderToast] = useState(null);
  const locationRef = useRef(null);

  // ── Socket.io connection ─────────────────────────────────────────────────
  useEffect(() => {
    const s = io(BACKEND, { transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('connect',    () => {
      console.log('✅ Socket connected to backend');
      setConnected(true);
    });
    s.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setConnected(false);
    });
    s.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });
    s.on('sensor_update', data => {
      console.log('📊 Sensor data received:', data);
      setSensorData(data);
    });
    s.on('health_alert',  data => {
      setAlerts(prev => [{ ...data, id: Date.now() }, ...prev].slice(0, 20));
    });
    s.on('reminder', data => {
      setReminderToast(data);
      setTimeout(() => setReminderToast(null), 6000);
    });
    return () => s.disconnect();
  }, []);

  // ── GPS location — send to backend every 30s so alerts include maps link ─
  useEffect(() => {
    if (!socket) return;
    if (!navigator.geolocation) return;
    let watchId = null;

    function sendLocation() {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          locationRef.current = loc;
          socket.emit('location_update', loc);
        },
        err => console.warn('Geolocation:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    }

    sendLocation();
    const interval = setInterval(sendLocation, 30000);
    watchId = navigator.geolocation.watchPosition(
      pos => {
        const loc = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        locationRef.current = loc;
        socket.emit('location_update', loc);
      },
      err => console.warn('Geolocation watch:', err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );

    return () => {
      clearInterval(interval);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [socket]);

  const clearAlerts = () => setAlerts([]);

  const renderTab = () => {
    const props = { socket, sensorData, backend: BACKEND };
    switch (activeTab) {
      case 'dashboard':  return <SensorDashboard {...props} />;
      case 'medical':    return <MedicalReport backend={BACKEND} />;
      case 'skin':       return <SkinAnalysis backend={BACKEND} />;
      case 'hospitals':  return <NearbyHospitals backend={BACKEND} />;
      case 'chat':       return <Chatbot backend={BACKEND} />;
      case 'steps':      return <StepsTracker socket={socket} sensorData={sensorData} />;
      case 'diet':       return <DietPlanner backend={BACKEND} />;
      case 'exercise':   return <ExercisePlanner backend={BACKEND} />;
      case 'reminders':  return <Reminders backend={BACKEND} socket={socket} />;
      default:           return null;
    }
  };

  const activeTabObj = TABS.find(t => t.id === activeTab);

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">

      {/* Sidebar */}
      <aside className={`fixed md:relative z-40 flex flex-col bg-gray-900 border-r border-gray-800
        transition-all duration-300 h-full ${sidebarOpen ? 'w-64' : 'w-0 md:w-20'} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className={`font-bold text-white text-sm whitespace-nowrap ${sidebarOpen ? '' : 'hidden'}`}>
            AI Health Monitor
          </span>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-150
                  ${isActive
                    ? 'bg-blue-600/20 border-r-2 border-blue-500 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-400' : tab.color}`} />
                <span className={`text-sm font-medium whitespace-nowrap ${sidebarOpen ? '' : 'hidden'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800 flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-xs text-gray-400 whitespace-nowrap ${sidebarOpen ? '' : 'hidden'}`}>
            {connected ? 'ESP32 Ready' : 'Disconnected'}
          </span>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {activeTabObj && (
              <div className="flex items-center gap-2">
                <activeTabObj.icon className={`w-5 h-5 ${activeTabObj.color}`} />
                <h1 className="text-base font-semibold text-white">{activeTabObj.label}</h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {sensorData.heartRate && (
              <div className="hidden sm:flex items-center gap-1 bg-red-900/30 px-3 py-1.5 rounded-lg border border-red-800/50">
                <Heart className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-300 font-medium">{sensorData.heartRate} BPM</span>
              </div>
            )}
            {sensorData.spo2 && (
              <div className="hidden sm:flex items-center gap-1 bg-blue-900/30 px-3 py-1.5 rounded-lg border border-blue-800/50">
                <Wind className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-blue-300 font-medium">{sensorData.spo2}%</span>
              </div>
            )}
            {sensorData.temperature && (
              <div className="hidden sm:flex items-center gap-1 bg-orange-900/30 px-3 py-1.5 rounded-lg border border-orange-800/50">
                <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-orange-300 font-medium">{sensorData.temperature}°C</span>
              </div>
            )}

            {/* Alerts bell */}
            <button onClick={() => setAlertsOpen(!alertsOpen)}
              className={`relative p-2 rounded-xl transition-colors
                ${alerts.length > 0 ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'hover:bg-gray-800 text-gray-400'}`}>
              {alerts.length > 0 ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {alerts.length > 9 ? '9+' : alerts.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Reminder toast */}
        {reminderToast && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2
            ${reminderToast.type === 'water'
              ? 'bg-blue-900/40 border-blue-700 text-blue-200'
              : 'bg-purple-900/40 border-purple-700 text-purple-200'}`}>
            {reminderToast.type === 'water' ? '💧' : '💊'}
            {reminderToast.message}
            <button onClick={() => setReminderToast(null)} className="ml-auto opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Alert panel */}
        {alertsOpen && (
          <div className="absolute right-4 top-16 z-50 w-96 max-w-[calc(100vw-2rem)] bg-gray-900 border border-red-800/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-red-900/20 border-b border-red-800/50">
              <span className="font-semibold text-red-400 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Health Alerts ({alerts.length})
              </span>
              <div className="flex gap-2">
                <button onClick={clearAlerts} className="text-xs text-gray-400 hover:text-white">Clear</button>
                <button onClick={() => setAlertsOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
              {alerts.length === 0
                ? <p className="text-center text-gray-500 py-8">No alerts</p>
                : alerts.map(alert => (
                  <div key={alert.id} className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">
                      {new Date(alert.timestamp).toLocaleTimeString('en-IN')}
                    </p>
                    {alert.alerts?.map((a, i) => (
                      <p key={i} className="text-sm text-red-300">{a}</p>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}
