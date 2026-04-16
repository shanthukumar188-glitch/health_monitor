import React, { useState, useRef } from 'react';
import { Upload, Microscope, X, Loader2, AlertCircle, CheckCircle2, Camera } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function SkinAnalysis({ backend }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();
  const cameraRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please upload an image file (JPG, PNG, WEBP).'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB.'); return; }
    setFile(f);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(f));
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${backend}/api/medical/analyze-skin`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.analysis);
    } catch (e) {
      setError(e.message || 'Skin analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(null); };

  const tips = [
    { icon: '☀️', title: 'Good Lighting', desc: 'Use natural or bright light' },
    { icon: '📏', title: 'Close-up Shot', desc: 'Capture the affected area clearly' },
    { icon: '🎯', title: 'Focus', desc: 'Ensure image is sharp and in focus' },
    { icon: '📐', title: 'Multiple Angles', desc: 'Try different angles for better analysis' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h2 className="section-title"><Microscope className="w-5 h-5 text-pink-400" /> Skin Analysis AI</h2>
        <p className="text-gray-400 text-sm mb-5">Upload a photo of skin condition (rash, mole, acne, eczema, etc.) for AI dermatology assessment.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {tips.map((t) => (
            <div key={t.title} className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700">
              <span className="text-2xl">{t.icon}</span>
              <p className="text-xs font-semibold text-white mt-1">{t.title}</p>
              <p className="text-xs text-gray-400">{t.desc}</p>
            </div>
          ))}
        </div>

        {!file ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all
              ${dragOver ? 'border-pink-500 bg-pink-900/10' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'}`}
          >
            <div className="flex justify-center gap-4 mb-4">
              <button
                onClick={() => inputRef.current.click()}
                className="btn-primary bg-pink-600 hover:bg-pink-500"
              >
                <Upload className="w-4 h-4" /> Upload Photo
              </button>
              <button
                onClick={() => cameraRef.current.click()}
                className="btn-secondary"
              >
                <Camera className="w-4 h-4" /> Take Photo
              </button>
            </div>
            <p className="text-gray-500 text-sm">or drag and drop image here</p>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-gray-700 bg-gray-800">
              <img src={preview} alt="Skin condition preview" className="w-full max-h-72 object-contain" />
              <button onClick={reset} className="absolute top-3 right-3 p-2 bg-gray-900/80 rounded-full text-gray-300 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400 bg-gray-800 rounded-xl px-4 py-2">
              <span className="text-pink-400">{file.name}</span>
              <span>•</span>
              <span>{(file.size / 1024).toFixed(0)} KB</span>
            </div>
            <button onClick={analyze} disabled={loading} className="btn-primary w-full justify-center py-3 bg-pink-600 hover:bg-pink-500">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Skin...</> : <><Microscope className="w-4 h-4" /> Analyze Skin Condition</>}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-900/20 border border-red-800 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>

      {result && (
        <div className="card">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-pink-400" /> Dermatology AI Assessment
          </h3>
          <div className="prose-health bg-gray-800/50 rounded-xl p-5 border border-gray-700">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">⚠️ This AI assessment does not replace a professional dermatologist. Please consult a licensed doctor for proper diagnosis.</p>
        </div>
      )}

      {/* Common skin conditions */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Detectable Conditions</h3>
        <div className="flex flex-wrap gap-2">
          {['Acne', 'Eczema', 'Psoriasis', 'Rosacea', 'Melanoma', 'Hives', 'Ringworm', 'Vitiligo', 'Dermatitis', 'Scabies', 'Chickenpox', 'Rashes', 'Warts', 'Keloids'].map((c) => (
            <span key={c} className="bg-pink-900/20 text-pink-300 border border-pink-800/50 px-3 py-1 rounded-full text-xs">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
