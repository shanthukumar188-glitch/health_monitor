import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Send, Loader2, Trash2, ChevronDown,
  Pill, Stethoscope, Apple, Dumbbell, MapPin, Heart, Brain
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const MODES = [
  { id: 'general',       label: 'General Health',   icon: Heart,       color: 'text-red-400',    desc: 'General health questions' },
  { id: 'symptoms',      label: 'Symptom Check',    icon: Stethoscope, color: 'text-blue-400',   desc: 'Analyze your symptoms' },
  { id: 'medicines',     label: 'Medicines',        icon: Pill,        color: 'text-yellow-400', desc: 'Drug information & dosage' },
  { id: 'diet',          label: 'Nutrition',        icon: Apple,       color: 'text-green-400',  desc: 'Diet & nutrition advice' },
  { id: 'exercise',      label: 'Fitness',          icon: Dumbbell,    color: 'text-orange-400', desc: 'Exercise guidance' },
  { id: 'hospitals',     label: 'Find Specialist',  icon: MapPin,      color: 'text-purple-400', desc: 'Specialist guidance' },
  { id: 'mental_health', label: 'Mental Health',    icon: Brain,       color: 'text-pink-400',   desc: 'Mental wellness support' },
];

const SUGGESTIONS = {
  general:       ['What are signs of dehydration?', 'How to boost immunity naturally?', 'What causes high blood pressure?', 'Benefits of good sleep?'],
  symptoms:      ['I have chest pain and shortness of breath', 'I have a severe headache and fever', 'My joints are swollen and painful', 'I feel dizzy when I stand up'],
  medicines:     ['What is metformin used for?', 'Side effects of ibuprofen', 'Can I take paracetamol with antibiotics?', 'What is the difference between omeprazole and pantoprazole?'],
  diet:          ['Diet for diabetes type 2', 'Foods to lower cholesterol', 'Best foods for heart health', 'Anti-inflammatory diet plan'],
  exercise:      ['Exercise for lower back pain', 'Beginner workout routine', 'Exercises for weight loss at home', 'How to improve cardiovascular health?'],
  hospitals:     ['Which doctor to see for chest pain?', 'When should I go to the ER?', 'What does a cardiologist treat?', 'Do I need a referral to see a specialist?'],
  mental_health: ['How to manage anxiety naturally?', 'What are signs of depression?', 'Mindfulness techniques for stress', 'How to improve sleep quality?'],
};

export default function Chatbot({ backend }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('general');
  const [showModes, setShowModes] = useState(false);
  const bottomRef = useRef();
  const inputRef = useRef();

  const currentMode = MODES.find((m) => m.id === mode);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Hello! 👋 I'm your AI Health Assistant. I'm currently in **${currentMode?.label}** mode.\n\n${currentMode?.desc}. How can I help you today?`,
      timestamp: new Date(),
    }]);
  }, [mode]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setLoading(true);

    const userMsg = { role: 'user', content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    const history = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${backend}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, mode, history }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date() }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${e.message}. Please check that the backend is running and GROQ_API_KEY is configured.`,
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => setMessages([{
    role: 'assistant',
    content: `Chat cleared. I'm in **${currentMode?.label}** mode. What would you like to know?`,
    timestamp: new Date(),
  }]);

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      {/* Mode selector */}
      <div className="card mb-3 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Chat Mode</p>
          <button onClick={clearChat} className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${mode === m.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
              >
                <Icon className={`w-3.5 h-3.5 ${mode === m.id ? 'text-white' : m.color}`} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-3 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : msg.isError
                    ? 'bg-red-900/30 border border-red-800 text-red-300 rounded-tl-none'
                    : 'bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700'}`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose-health text-sm">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                {msg.timestamp?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 mr-2">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-gray-400 ml-1">AI thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div className="flex gap-2 flex-wrap mb-3">
        {(SUGGESTIONS[mode] || []).map((s) => (
          <button
            key={s}
            onClick={() => sendMessage(s)}
            disabled={loading}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-1.5 rounded-full transition-all hover:border-blue-600 truncate max-w-[200px]"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="card p-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Ask about ${currentMode?.desc.toLowerCase()}...`}
              rows={1}
              className="input-field resize-none overflow-hidden py-3 pr-4 min-h-[48px] max-h-40"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="btn-primary h-12 px-4 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">
          AI health information only — not a substitute for professional medical advice. Press Enter to send, Shift+Enter for new line.
        </p>
      </div>
    </div>
  );
}
