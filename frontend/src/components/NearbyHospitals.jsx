import React, { useState, useEffect } from 'react';
import { MapPin, Search, Phone, Globe, Navigation, Loader2, AlertCircle, Star, Clock, Building2, Stethoscope } from 'lucide-react';

const SPECIALTIES = [
  { id: 'all', label: 'All', icon: '🏥' },
  { id: 'cardiologist', label: 'Cardiology', icon: '❤️' },
  { id: 'dermatologist', label: 'Dermatology', icon: '🔬' },
  { id: 'neurologist', label: 'Neurology', icon: '🧠' },
  { id: 'orthopedic', label: 'Orthopedic', icon: '🦴' },
  { id: 'pediatrician', label: 'Pediatrics', icon: '👶' },
  { id: 'gynecologist', label: 'Gynecology', icon: '🌸' },
  { id: 'dentist', label: 'Dentist', icon: '🦷' },
  { id: 'ophthalmologist', label: 'Eye Care', icon: '👁️' },
  { id: 'psychiatrist', label: 'Psychiatry', icon: '🧘' },
  { id: 'general', label: 'General', icon: '👨‍⚕️' },
];

export default function NearbyHospitals({ backend }) {
  const [location, setLocation] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [radius, setRadius] = useState(5000);
  const [locationGranted, setLocationGranted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const getLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported by your browser.'); return; }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setLocation(loc);
        setLocationGranted(true);
        fetchHospitals(loc.lat, loc.lon);
      },
      () => { setError('Location access denied. Please enable location permission.'); setLoading(false); }
    );
  };

  const fetchHospitals = async (lat, lon, specialty = 'all') => {
    setLoading(true); setError(null);
    try {
      const endpoint = specialty === 'all'
        ? `${backend}/api/hospitals/nearby?lat=${lat}&lon=${lon}&radius=${radius}`
        : `${backend}/api/hospitals/specialists?lat=${lat}&lon=${lon}&specialty=${specialty}&radius=${radius}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setHospitals(specialty === 'all' ? (data.hospitals || []) : (data.specialists || []));
    } catch (e) {
      setError(e.message || 'Failed to fetch hospitals.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtyChange = (specialty) => {
    setSelectedSpecialty(specialty);
    if (location) fetchHospitals(location.lat, location.lon, specialty);
  };

  const openDirections = (h) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`;
    window.open(url, '_blank');
  };

  const openMap = (h) => {
    const url = `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}&zoom=17`;
    window.open(url, '_blank');
  };

  const filtered = hospitals.filter((h) =>
    searchQuery === '' || h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (h.address && h.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getTypeColor = (type) => {
    if (type === 'hospital') return 'badge-red';
    if (type === 'clinic') return 'badge-blue';
    if (type === 'dentist') return 'badge-yellow';
    return 'badge-green';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header controls */}
      <div className="card">
        <h2 className="section-title"><MapPin className="w-5 h-5 text-red-400" /> Nearby Hospitals & Specialists</h2>

        {!locationGranted ? (
          <div className="text-center py-10">
            <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-300 font-medium mb-2">Location access required</p>
            <p className="text-gray-500 text-sm mb-6">We'll find hospitals near your current location using OpenStreetMap (free, no API key needed).</p>
            <button onClick={getLocation} disabled={loading} className="btn-primary mx-auto bg-red-600 hover:bg-red-500">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting location...</> : <><Navigation className="w-4 h-4" /> Allow Location Access</>}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search + Radius */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text" placeholder="Search hospitals..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field pl-9"
                />
              </div>
              <select
                value={radius}
                onChange={(e) => { setRadius(+e.target.value); if (location) fetchHospitals(location.lat, location.lon, selectedSpecialty); }}
                className="input-field w-40"
              >
                <option value={1000}>Within 1 km</option>
                <option value={3000}>Within 3 km</option>
                <option value={5000}>Within 5 km</option>
                <option value={10000}>Within 10 km</option>
                <option value={20000}>Within 20 km</option>
              </select>
              <button onClick={() => fetchHospitals(location.lat, location.lon, selectedSpecialty)} disabled={loading} className="btn-primary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Refresh
              </button>
            </div>

            {/* Specialty filter */}
            <div className="flex gap-2 flex-wrap">
              {SPECIALTIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSpecialtyChange(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                    ${selectedSpecialty === s.id
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-900/20 border border-red-800 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="w-10 h-10 text-red-400 animate-spin mb-3" />
          <p className="text-gray-400">Searching nearby hospitals via OpenStreetMap...</p>
        </div>
      )}

      {!loading && locationGranted && (
        <>
          <p className="text-gray-400 text-sm">
            Found <span className="text-white font-semibold">{filtered.length}</span> result{filtered.length !== 1 ? 's' : ''} within {radius / 1000} km
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((h) => (
              <div key={h.id} className="card hover:border-gray-600 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={getTypeColor(h.type)}>{h.type || 'hospital'}</span>
                      {h.emergency && <span className="badge-red">🚨 24/7 Emergency</span>}
                    </div>
                    <h3 className="font-semibold text-white text-sm leading-tight">{h.name}</h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-red-400">{h.distanceKm} km</p>
                  </div>
                </div>

                {h.address && h.address !== 'Address not available' && (
                  <p className="text-xs text-gray-400 flex items-start gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {h.address}
                  </p>
                )}

                {h.phone && h.phone !== 'Not available' && (
                  <a href={`tel:${h.phone}`} className="text-xs text-blue-400 flex items-center gap-1.5 mb-2 hover:text-blue-300">
                    <Phone className="w-3.5 h-3.5" /> {h.phone}
                  </a>
                )}

                {h.openingHours && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
                    <Clock className="w-3.5 h-3.5" /> {h.openingHours}
                  </p>
                )}

                {/* Specialists */}
                {h.specialists && h.specialists.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" /> Specialists:</p>
                    <div className="flex flex-wrap gap-1">
                      {h.specialists.slice(0, 5).map((s) => (
                        <span key={s} className="bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-full text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => openDirections(h)} className="btn-primary flex-1 justify-center text-xs py-2 bg-red-600 hover:bg-red-500">
                    <Navigation className="w-3.5 h-3.5" /> Directions
                  </button>
                  <button onClick={() => openMap(h)} className="btn-secondary flex-1 justify-center text-xs py-2 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> View Map
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && !loading && locationGranted && (
              <div className="col-span-2 text-center py-12">
                <Building2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">No hospitals found in this area</p>
                <p className="text-gray-500 text-sm">Try increasing the search radius</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
