const express = require('express');
const router = express.Router();
const axios = require('axios');

// ─── Get nearby hospitals using Overpass API (OpenStreetMap - FREE) ────────
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lon, radius = 5000, type = 'hospital' } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }

    // Overpass API query for hospitals, clinics, and doctors
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="hospital"](around:${radius},${lat},${lon});
        way["amenity"="hospital"](around:${radius},${lat},${lon});
        node["amenity"="clinic"](around:${radius},${lat},${lon});
        way["amenity"="clinic"](around:${radius},${lat},${lon});
        node["amenity"="doctors"](around:${radius},${lat},${lon});
        node["healthcare"="hospital"](around:${radius},${lat},${lon});
        node["healthcare"="clinic"](around:${radius},${lat},${lon});
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );

    const elements = response.data.elements || [];

    // Parse and format hospitals
    const hospitals = elements
      .filter((el) => el.tags && (el.tags.name || el.tags['name:en']))
      .map((el) => {
        const name = el.tags['name:en'] || el.tags.name || 'Unknown Hospital';
        const lat2 = el.lat || (el.center && el.center.lat) || lat;
        const lon2 = el.lon || (el.center && el.center.lon) || lon;

        // Calculate distance
        const dist = getDistanceKm(parseFloat(lat), parseFloat(lon), parseFloat(lat2), parseFloat(lon2));

        // Generate mock specialist info based on hospital type
        const amenity = el.tags.amenity || el.tags.healthcare || 'hospital';
        const specialists = getSpecialists(amenity, el.tags);

        return {
          id: el.id,
          name,
          type: amenity,
          address: [
            el.tags['addr:street'],
            el.tags['addr:city'],
            el.tags['addr:state'],
          ]
            .filter(Boolean)
            .join(', ') || 'Address not available',
          phone: el.tags.phone || el.tags['contact:phone'] || 'Not available',
          website: el.tags.website || el.tags['contact:website'] || null,
          openingHours: el.tags['opening_hours'] || '24/7',
          lat: lat2,
          lon: lon2,
          distanceKm: dist.toFixed(2),
          emergency: el.tags.emergency === 'yes' || amenity === 'hospital',
          specialists,
        };
      })
      .filter((h) => h.distanceKm <= radius / 1000)
      .sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
      .slice(0, 20);

    res.json({ success: true, hospitals, count: hospitals.length });
  } catch (error) {
    console.error('Hospitals fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch nearby hospitals', details: error.message });
  }
});

// ─── Search specialists by type ───────────────────────────────────────────
router.get('/specialists', async (req, res) => {
  try {
    const { lat, lon, specialty, radius = 5000 } = req.query;

    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const healthcareTypes = {
      cardiologist: '"healthcare:speciality"="cardiology"',
      dermatologist: '"healthcare:speciality"="dermatology"',
      neurologist: '"healthcare:speciality"="neurology"',
      orthopedic: '"healthcare:speciality"="orthopaedics"',
      pediatrician: '"healthcare:speciality"="paediatrics"',
      gynecologist: '"healthcare:speciality"="gynaecology"',
      dentist: '"amenity"="dentist"',
      ophthalmologist: '"healthcare:speciality"="ophthalmology"',
      psychiatrist: '"healthcare:speciality"="psychiatry"',
      general: '"amenity"="doctors"',
    };

    const filter = healthcareTypes[specialty] || '"amenity"="doctors"';

    const query = `
      [out:json][timeout:25];
      (
        node[${filter}](around:${radius},${lat},${lon});
        node["amenity"="hospital"](around:${radius},${lat},${lon});
      );
      out body;
    `;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );

    const results = (response.data.elements || [])
      .filter((el) => el.tags && el.tags.name)
      .map((el) => ({
        id: el.id,
        name: el.tags.name,
        specialty: specialty || 'General Practitioner',
        address: el.tags['addr:street'] || 'Address not available',
        phone: el.tags.phone || 'Not available',
        lat: el.lat,
        lon: el.lon,
        distanceKm: getDistanceKm(parseFloat(lat), parseFloat(lon), el.lat, el.lon).toFixed(2),
      }))
      .sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
      .slice(0, 15);

    res.json({ success: true, specialists: results });
  } catch (error) {
    console.error('Specialist search error:', error.message);
    res.status(500).json({ error: 'Failed to fetch specialists' });
  }
});

// ─── Utility functions ─────────────────────────────────────────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSpecialists(amenity, tags) {
  const base = ['General Physician', 'Emergency Medicine'];
  if (amenity === 'hospital') {
    return [...base, 'Cardiology', 'Neurology', 'Orthopedics', 'Radiology', 'Pathology'];
  }
  if (amenity === 'clinic') return [...base, 'Dermatology', 'ENT', 'Gynecology'];
  if (amenity === 'dentist') return ['Dentist', 'Oral Surgeon'];
  return base;
}

module.exports = router;
