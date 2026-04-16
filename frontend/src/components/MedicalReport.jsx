import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function MedicalReport({ backend }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const ACCEPTED = ['image/jpeg','image/png','image/jpg','image/webp','application/pdf'];

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) { setError('Please upload an image (JPG/PNG/WEBP) or PDF file.'); return; }
    if (f.size > 15 * 1024 * 1024) { setError('File must be under 15 MB.'); return; }
    setFile(f);
    setError(null);
    setResult(null);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'medical_report');
      const res = await fetch(`${backend}/api/medical/analyze-report`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.analysis);
    } catch (e) {
      setError(e.message || 'Analysis failed. Make sure the backend is running and GROQ_API_KEY is set.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(null); };

  const downloadResult = () => {
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'medical-report-analysis.md'; a.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h2 className="section-title"><FileText className="w-5 h-5 text-green-400" /> Medical Report Analyzer</h2>
        <p className="text-gray-400 text-sm mb-5">Upload X-rays, blood tests, MRI scans, ECGs, or any medical report (image or PDF). AI will analyze and summarize findings.</p>

        {!file ? (
          <div
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            onClick={() => inputRef.current.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
              ${dragOver ? 'border-green-500 bg-green-900/10' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'}`}
          >
            <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-300 font-medium">Drop your report here or click to browse</p>
            <p className="text-gray-500 text-sm mt-1">Supports: JPG, PNG, WEBP, PDF • Max 15MB</p>
            <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {preview && (
              <div className="rounded-xl overflow-hidden border border-gray-800 max-h-64">
                <img src={preview} alt="Report preview" className="w-full object-contain max-h-64" />
              </div>
            )}
            <button onClick={analyze} disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Report...</> : <><CheckCircle2 className="w-4 h-4" /> Analyze with AI</>}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-900/20 border border-red-800/50 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>

      {result && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" /> AI Analysis Result
            </h3>
            <button onClick={downloadResult} className="btn-secondary text-sm gap-2 flex items-center">
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
          <div className="prose-health bg-gray-800/50 rounded-xl p-5 border border-gray-700">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">⚠️ AI analysis is not a substitute for professional medical advice. Always consult a qualified doctor.</p>
        </div>
      )}

      {/* Sample report types */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'X-Ray', icon: '🦴', desc: 'Chest, bone, spine scans' },
          { label: 'Blood Test', icon: '🩸', desc: 'CBC, lipid panel, HbA1c' },
          { label: 'ECG', icon: '💗', desc: 'Heart rhythm analysis' },
          { label: 'MRI / CT', icon: '🧠', desc: 'Brain, organ scans' },
        ].map((t) => (
          <div key={t.label} className="card text-center py-4">
            <span className="text-3xl">{t.icon}</span>
            <p className="text-sm font-semibold text-white mt-2">{t.label}</p>
            <p className="text-xs text-gray-400">{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
