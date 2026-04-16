import React, { useState } from 'react';
import { Salad, Loader2, RefreshCw, Download, ChevronDown, Apple, Flame } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const GOALS = ['Lose weight', 'Gain muscle', 'Maintain health', 'Manage diabetes', 'Lower cholesterol', 'Build endurance', 'Improve energy'];
const CONDITIONS = ['None', 'Diabetes Type 1', 'Diabetes Type 2', 'Hypertension', 'Heart disease', 'Thyroid', 'PCOD/PCOS', 'Kidney disease', 'Lactose intolerant', 'Celiac/Gluten intolerant'];
const PREFS = ['No restrictions', 'Vegetarian', 'Vegan', 'Jain', 'Keto', 'Low carb', 'Low fat', 'Gluten-free', 'Dairy-free'];

export default function DietPlanner({ backend }) {
  const [form, setForm] = useState({ age: '', weight: '', height: '', goal: 'Maintain health', conditions: 'None', preferences: 'No restrictions', activityLevel: 'Moderate' });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${backend}/api/chat/diet-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPlan(data.plan);
    } catch (e) {
      setError(e.message || 'Failed to generate diet plan. Check GROQ_API_KEY.');
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const blob = new Blob([plan], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'diet-plan.md'; a.click();
  };

  const bmr = form.weight && form.height && form.age
    ? Math.round(10 * +form.weight + 6.25 * +form.height - 5 * +form.age + 5)
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Form */}
      <div className="card">
        <h2 className="section-title"><Salad className="w-5 h-5 text-emerald-400" /> AI Diet Planner</h2>
        <p className="text-gray-400 text-sm mb-5">Get a personalized 7-day diet plan powered by Groq AI, tailored to your health goals and conditions.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Age (years)</label>
            <input type="number" placeholder="e.g. 30" value={form.age} onChange={(e) => set('age', e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Weight (kg)</label>
            <input type="number" placeholder="e.g. 70" value={form.weight} onChange={(e) => set('weight', e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Height (cm)</label>
            <input type="number" placeholder="e.g. 170" value={form.height} onChange={(e) => set('height', e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Activity Level</label>
            <select value={form.activityLevel} onChange={(e) => set('activityLevel', e.target.value)} className="input-field">
              {['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Health Goal</label>
            <select value={form.goal} onChange={(e) => set('goal', e.target.value)} className="input-field">
              {GOALS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Health Conditions</label>
            <select value={form.conditions} onChange={(e) => set('conditions', e.target.value)} className="input-field">
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Dietary Preferences</label>
            <div className="flex flex-wrap gap-2">
              {PREFS.map((p) => (
                <button key={p} onClick={() => set('preferences', p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                    ${form.preferences === p ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-emerald-600'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* BMR calculator */}
        {bmr && (
          <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-3 mb-4">
            <Flame className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Estimated Basal Metabolic Rate</p>
              <p className="text-white font-semibold">{bmr} kcal/day (at rest)</p>
            </div>
          </div>
        )}

        <button onClick={generate} disabled={loading} className="btn-primary w-full justify-center py-3 bg-emerald-600 hover:bg-emerald-500">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating 7-day plan...</> : <><Apple className="w-4 h-4" /> Generate My Diet Plan</>}
        </button>

        {error && <p className="text-red-400 text-sm mt-3 text-center">❌ {error}</p>}
      </div>

      {/* Result */}
      {plan && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">🥗 Your Personalized Diet Plan</h3>
            <div className="flex gap-2">
              <button onClick={generate} disabled={loading} className="btn-secondary text-xs py-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </button>
              <button onClick={download} className="btn-secondary text-xs py-1.5">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="prose-health bg-gray-800/50 rounded-xl p-5 border border-gray-700 max-h-[600px] overflow-y-auto">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">⚠️ Always consult a registered dietitian before making significant dietary changes.</p>
        </div>
      )}

      {/* Quick nutrition facts */}
      {!plan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { emoji: '🥦', label: 'Broccoli', fact: '55 cal / 100g • Rich in Vitamin C & K' },
            { emoji: '🍗', label: 'Chicken', fact: '165 cal / 100g • High protein lean meat' },
            { emoji: '🫐', label: 'Blueberries', fact: '57 cal / 100g • Antioxidant powerhouse' },
            { emoji: '🥑', label: 'Avocado', fact: '160 cal / 100g • Healthy fats & fiber' },
          ].map((f) => (
            <div key={f.label} className="card text-center py-4">
              <span className="text-3xl">{f.emoji}</span>
              <p className="text-sm font-semibold text-white mt-2">{f.label}</p>
              <p className="text-xs text-gray-400 mt-1">{f.fact}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
