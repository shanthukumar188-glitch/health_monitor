import React, { useState, useEffect } from 'react';
import { Footprints, Target, TrendingUp, Award, RefreshCw, Flame } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const DAILY_GOAL = 10000;

export default function StepsTracker({ socket, sensorData }) {
  const [todaySteps, setTodaySteps] = useState(0);
  const [weeklyData, setWeeklyData] = useState(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const saved = JSON.parse(localStorage.getItem('weeklySteps') || 'null');
    if (saved) return saved;
    return days.map((day, i) => ({ day, steps: Math.floor(Math.random() * 8000 + 2000), goal: DAILY_GOAL }));
  });
  const [goal, setGoal] = useState(parseInt(localStorage.getItem('stepGoal') || '10000'));
  const [editGoal, setEditGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState(goal);
  const [liveSteps, setLiveSteps] = useState(0);

  // Receive live steps from ESP32 via socket
  useEffect(() => {
    if (sensorData?.steps !== undefined && sensorData.steps !== null) {
      setLiveSteps(sensorData.steps);
      setTodaySteps(sensorData.steps);
    }
  }, [sensorData]);

  useEffect(() => {
    localStorage.setItem('weeklySteps', JSON.stringify(weeklyData));
  }, [weeklyData]);

  const progress = Math.min(100, (todaySteps / goal) * 100);
  const calories = Math.round(todaySteps * 0.04);
  const distanceKm = (todaySteps * 0.0008).toFixed(2);
  const activeMin = Math.round(todaySteps / 100);

  const saveGoal = () => {
    setGoal(tempGoal);
    localStorage.setItem('stepGoal', tempGoal);
    setEditGoal(false);
  };

  const addManualSteps = (n) => {
    setTodaySteps((prev) => {
      const updated = prev + n;
      // Update today in weekly data
      const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
      setWeeklyData((w) => w.map((d) => d.day === today ? { ...d, steps: updated } : d));
      return updated;
    });
  };

  const resetToday = () => {
    setTodaySteps(0);
    setLiveSteps(0);
  };

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Today's progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="section-title mb-0"><Footprints className="w-5 h-5 text-yellow-400" /> Steps Tracker</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditGoal(!editGoal)} className="btn-secondary text-xs py-1.5">
              <Target className="w-3.5 h-3.5" /> Set Goal
            </button>
            <button onClick={resetToday} className="btn-secondary text-xs py-1.5 text-red-400">
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>

        {editGoal && (
          <div className="flex gap-2 mb-5 items-center bg-gray-800 p-3 rounded-xl">
            <input type="number" value={tempGoal} onChange={(e) => setTempGoal(+e.target.value)}
              className="input-field flex-1" min={1000} max={50000} step={500} />
            <button onClick={saveGoal} className="btn-primary">Save</button>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Circular progress */}
          <div className="relative w-36 h-36 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#1f2937" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="54" fill="none"
                stroke={progress >= 100 ? '#10b981' : progress >= 50 ? '#f59e0b' : '#3b82f6'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{progress.toFixed(0)}%</span>
              <span className="text-xs text-gray-400">of goal</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 w-full">
            <div className="flex items-end gap-2 mb-2">
              <span className="text-5xl font-bold text-yellow-400">{todaySteps.toLocaleString()}</span>
              <span className="text-gray-400 mb-2">/ {goal.toLocaleString()} steps</span>
            </div>
            {liveSteps > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live from ESP32 wearable
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{calories}</p>
                <p className="text-xs text-gray-400">Calories</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <TrendingUp className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{distanceKm}</p>
                <p className="text-xs text-gray-400">km</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <Award className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{activeMin}</p>
                <p className="text-xs text-gray-400">Active min</p>
              </div>
            </div>
          </div>
        </div>

        {/* Achievement badges */}
        <div className="flex gap-2 mt-5 flex-wrap">
          {todaySteps >= 2000 && <span className="badge-green">🚶 2K Steps</span>}
          {todaySteps >= 5000 && <span className="badge-blue">🏃 5K Steps</span>}
          {todaySteps >= 10000 && <span className="badge-yellow">🏆 10K Goal!</span>}
          {todaySteps >= 15000 && <span className="badge-red">⚡ Super Active!</span>}
        </div>

        {/* Manual add steps */}
        <div className="mt-5 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-3">Add steps manually (when ESP32 not connected):</p>
          <div className="flex gap-2 flex-wrap">
            {[500, 1000, 2000, 5000].map((n) => (
              <button key={n} onClick={() => addManualSteps(n)} className="btn-secondary text-sm py-2">
                +{n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-yellow-400" /> Weekly Steps
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }}
              formatter={(v) => [v.toLocaleString(), 'Steps']}
            />
            <Bar dataKey="steps" radius={[6, 6, 0, 0]}>
              {weeklyData.map((entry, i) => (
                <Cell key={i} fill={entry.steps >= goal ? '#10b981' : entry.steps >= goal * 0.7 ? '#f59e0b' : '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 justify-center mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Goal reached</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> 70%+ done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Below 70%</span>
        </div>
      </div>

      {/* Tips */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">💡 Step Tips</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          {['Take stairs instead of the elevator', 'Park farther away to walk more', 'Take a 10-min walk after each meal', '10,000 steps ≈ 500 calories burned', 'Morning walks boost metabolism for the entire day'].map((tip) => (
            <li key={tip} className="flex items-start gap-2"><span className="text-yellow-400 flex-shrink-0">→</span>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
