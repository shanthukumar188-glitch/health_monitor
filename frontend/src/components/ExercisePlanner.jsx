import React, { useState } from 'react';
import { Dumbbell, Loader2, RefreshCw, Download, Play, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const FITNESS_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const GOALS = ['Lose weight', 'Build muscle', 'Improve endurance', 'Increase flexibility', 'Stress relief', 'Sport-specific', 'Rehabilitation'];
const TIMES = ['15 minutes', '30 minutes', '45 minutes', '60 minutes', '90 minutes'];
const EQUIPMENT = ['No equipment (bodyweight)', 'Dumbbells only', 'Resistance bands', 'Full gym access', 'Home gym', 'Yoga mat only'];

const QUICK_WORKOUTS = [
  {
    title: '5-Min Morning Stretch',
    icon: '🌅',
    exercises: ['Neck rolls (30s each side)', 'Shoulder circles (20 each)', 'Cat-cow stretch (10 reps)', 'Hip circles (15 each)', 'Forward fold (30s)'],
    duration: '5 min',
    level: 'All levels'
  },
  {
    title: '10-Min HIIT Cardio',
    icon: '🔥',
    exercises: ['Jumping jacks (45s)', 'Rest (15s)', 'High knees (45s)', 'Rest (15s)', 'Burpees (45s)', 'Rest (15s)', 'Mountain climbers (45s)'],
    duration: '10 min',
    level: 'Intermediate'
  },
  {
    title: 'Beginner Core',
    icon: '💪',
    exercises: ['Plank (3×20s)', 'Crunches (3×15)', 'Leg raises (3×10)', 'Side plank (2×15s)', 'Superman holds (3×10)'],
    duration: '15 min',
    level: 'Beginner'
  },
  {
    title: 'Office Desk Workout',
    icon: '💼',
    exercises: ['Seated leg raises (20)', 'Chair squats (15)', 'Desk push-ups (10)', 'Calf raises (25)', 'Shoulder shrugs (20)'],
    duration: '8 min',
    level: 'All levels'
  },
];

export default function ExercisePlanner({ backend }) {
  const [form, setForm] = useState({ age: '', fitnessLevel: 'Beginner', goal: 'Lose weight', conditions: '', availableTime: '30 minutes', equipment: 'No equipment (bodyweight)' });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [completedExercises, setCompletedExercises] = useState(new Set());

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${backend}/api/chat/exercise-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPlan(data.plan);
    } catch (e) {
      setError(e.message || 'Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const blob = new Blob([plan], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exercise-plan.md'; a.click();
  };

  const toggleExercise = (idx) => {
    setCompletedExercises((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Form */}
      <div className="card">
        <h2 className="section-title"><Dumbbell className="w-5 h-5 text-orange-400" /> AI Exercise Planner</h2>
        <p className="text-gray-400 text-sm mb-5">Get a personalized 4-week progressive workout plan tailored to your fitness level and goals.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Age</label>
            <input type="number" placeholder="e.g. 28" value={form.age} onChange={(e) => set('age', e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Fitness Level</label>
            <div className="flex gap-2">
              {FITNESS_LEVELS.map((l) => (
                <button key={l} onClick={() => set('fitnessLevel', l)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border
                    ${form.fitnessLevel === l ? 'bg-orange-600 text-white border-orange-600' : 'bg-gray-800 text-gray-300 border-gray-700'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Goal</label>
            <select value={form.goal} onChange={(e) => set('goal', e.target.value)} className="input-field">
              {GOALS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Time Available per Day</label>
            <select value={form.availableTime} onChange={(e) => set('availableTime', e.target.value)} className="input-field">
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Equipment Available</label>
            <select value={form.equipment} onChange={(e) => set('equipment', e.target.value)} className="input-field">
              {EQUIPMENT.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Health Conditions / Injuries (if any)</label>
            <input type="text" placeholder="e.g. bad knees, lower back pain" value={form.conditions} onChange={(e) => set('conditions', e.target.value)} className="input-field" />
          </div>
        </div>

        <button onClick={generate} disabled={loading} className="btn-primary w-full justify-center py-3 bg-orange-600 hover:bg-orange-500">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating 4-week plan...</> : <><Dumbbell className="w-4 h-4" /> Generate My Exercise Plan</>}
        </button>

        {error && <p className="text-red-400 text-sm mt-3 text-center">❌ {error}</p>}
      </div>

      {/* AI Plan result */}
      {plan && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">💪 Your 4-Week Workout Plan</h3>
            <div className="flex gap-2">
              <button onClick={generate} disabled={loading} className="btn-secondary text-xs py-1.5"><RefreshCw className="w-3.5 h-3.5" /> Redo</button>
              <button onClick={download} className="btn-secondary text-xs py-1.5"><Download className="w-3.5 h-3.5" /> Save</button>
            </div>
          </div>
          <div className="prose-health bg-gray-800/50 rounded-xl p-5 border border-gray-700 max-h-[600px] overflow-y-auto">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Quick workout cards */}
      <h3 className="text-base font-semibold text-gray-200">⚡ Quick Workouts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUICK_WORKOUTS.map((w, wi) => (
          <div key={wi} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{w.icon}</span>
                <div>
                  <p className="font-semibold text-white text-sm">{w.title}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="badge-blue">{w.duration}</span>
                    <span className="badge-green">{w.level}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveWorkout(activeWorkout === wi ? null : wi);
                  setCompletedExercises(new Set());
                }}
                className={`btn-secondary text-xs py-1.5 ${activeWorkout === wi ? 'border-orange-600 text-orange-400' : ''}`}
              >
                {activeWorkout === wi ? '⏹ Stop' : <><Play className="w-3.5 h-3.5" /> Start</>}
              </button>
            </div>
            <ul className="space-y-2">
              {w.exercises.map((ex, ei) => (
                <li key={ei}
                  onClick={() => activeWorkout === wi && toggleExercise(ei)}
                  className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 transition-all
                    ${activeWorkout === wi ? 'cursor-pointer hover:bg-gray-700' : ''}
                    ${completedExercises.has(ei) && activeWorkout === wi ? 'bg-emerald-900/20 text-emerald-400 line-through' : 'text-gray-300'}`}
                >
                  <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${completedExercises.has(ei) && activeWorkout === wi ? 'text-emerald-400' : 'text-gray-600'}`} />
                  {ex}
                </li>
              ))}
            </ul>
            {activeWorkout === wi && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{ width: `${(completedExercises.size / w.exercises.length) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                  {completedExercises.size} / {w.exercises.length} completed
                  {completedExercises.size === w.exercises.length && ' 🎉 Workout done!'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
