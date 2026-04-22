const express = require('express');
const axios = require('axios');

const router = express.Router();

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REQUEST_HEADERS = {
  'User-Agent': 'health-monitor/1.0 (local-dev)',
};

function parseRadius(value, fallback = 5000) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSpecialists(amenity) {
  const base = ['General Physician', 'Emergency Medicine'];
  if (amenity === 'hospital') {
    return [...base, 'Cardiology', 'Neurology', 'Orthopedics', 'Radiology', 'Pathology'];
  }
  if (amenity === 'clinic') return [...base, 'Dermatology', 'ENT', 'Gynecology'];
  if (amenity === 'dentist') return ['Dentist', 'Oral Surgeon'];
  return base;
}

function buildAddress(tags = {}) {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:state'],
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : 'Address not available';
}

function getElementCoords(element, fallbackLat, fallbackLon) {
  return {
    lat: element.lat || element.center?.lat || fallbackLat,
    lon: element.lon || element.center?.lon || fallbackLon,
  };
}

function dedupePlaces(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.name}|${item.lat}|${item.lon}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function queryOverpass(query) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await axios.post(
        endpoint,
        `data=${encodeURIComponent(query)}`,
        {
          headers: {
            ...REQUEST_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      if (Array.isArray(response.data?.elements)) {
        return response.data.elements;
      }

      throw new Error(`Unexpected response from ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to reach Overpass API');
}

function getBoundingBox(lat, lon, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);

  return {
    left: lon - lonDelta,
    top: lat + latDelta,
    right: lon + lonDelta,
    bottom: lat - latDelta,
  };
}

async function queryNominatim(searchTerm, lat, lon, radius) {
  const box = getBoundingBox(lat, lon, radius);
  const response = await axios.get(NOMINATIM_ENDPOINT, {
    headers: REQUEST_HEADERS,
    params: {
      q: searchTerm,
      format: 'jsonv2',
      limit: 20,
      addressdetails: 1,
      bounded: 1,
      viewbox: `${box.left},${box.top},${box.right},${box.bottom}`,
    },
    timeout: 30000,
  });

  return Array.isArray(response.data) ? response.data : [];
}

function mapNominatimResults(results, originLat, originLon, fallbackType = 'hospital') {
  return dedupePlaces(
    results
      .map((item) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const type = item.type || fallbackType;
        const name = item.name || item.display_name?.split(',')[0] || 'Unknown Hospital';

        return {
          id: item.place_id,
          name,
          type,
          address: item.display_name || 'Address not available',
          phone: 'Not available',
          website: null,
          openingHours: 'Not available',
          lat,
          lon,
          distanceKm: getDistanceKm(originLat, originLon, lat, lon).toFixed(2),
          emergency: type === 'hospital',
          specialists: getSpecialists(type),
        };
      })
      .sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
  );
}

router.get('/nearby', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const radius = parseRadius(req.query.radius);

    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"hospital|clinic|doctors|dentist"](around:${radius},${lat},${lon});
        way["amenity"~"hospital|clinic|doctors|dentist"](around:${radius},${lat},${lon});
        node["healthcare"~"hospital|clinic"](around:${radius},${lat},${lon});
        way["healthcare"~"hospital|clinic"](around:${radius},${lat},${lon});
      );
      out center tags;
    `;

    const originLat = parseFloat(lat);
    const originLon = parseFloat(lon);
    let hospitals;

    try {
      const elements = await queryOverpass(query);
      hospitals = dedupePlaces(
        elements
          .filter((el) => el.tags && (el.tags.name || el.tags['name:en']))
          .map((el) => {
            const name = el.tags['name:en'] || el.tags.name || 'Unknown Hospital';
            const coords = getElementCoords(el, originLat, originLon);
            const amenity = el.tags.amenity || el.tags.healthcare || 'hospital';
            const distanceKm = getDistanceKm(originLat, originLon, coords.lat, coords.lon);

            return {
              id: el.id,
              name,
              type: amenity,
              address: buildAddress(el.tags),
              phone: el.tags.phone || el.tags['contact:phone'] || 'Not available',
              website: el.tags.website || el.tags['contact:website'] || null,
              openingHours: el.tags.opening_hours || '24/7',
              lat: coords.lat,
              lon: coords.lon,
              distanceKm: distanceKm.toFixed(2),
              emergency: el.tags.emergency === 'yes' || amenity === 'hospital',
              specialists: getSpecialists(amenity),
            };
          })
          .filter((item) => parseFloat(item.distanceKm) <= radius / 1000)
          .sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
          .slice(0, 20)
      );
    } catch (overpassError) {
      const fallbackResults = await queryNominatim('hospital OR clinic', originLat, originLon, radius);
      hospitals = mapNominatimResults(fallbackResults, originLat, originLon).slice(0, 20);
    }

    res.json({ success: true, hospitals, count: hospitals.length });
  } catch (error) {
    console.error('Hospitals fetch error:', error.message);
    res.status(502).json({ error: 'Failed to fetch nearby hospitals', details: error.message });
  }
});

router.get('/specialists', async (req, res) => {
  try {
    const { lat, lon, specialty } = req.query;
    const radius = parseRadius(req.query.radius);

    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon required' });
    }

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
        way[${filter}](around:${radius},${lat},${lon});
        node["amenity"="hospital"](around:${radius},${lat},${lon});
        way["amenity"="hospital"](around:${radius},${lat},${lon});
      );
      out center tags;
    `;

    const originLat = parseFloat(lat);
    const originLon = parseFloat(lon);
    let specialists;

    try {
      const elements = await queryOverpass(query);
      specialists = dedupePlaces(
        elements
          .filter((el) => el.tags && (el.tags.name || el.tags['name:en']))
          .map((el) => {
            const coords = getElementCoords(el, originLat, originLon);

            return {
              id: el.id,
              name: el.tags['name:en'] || el.tags.name,
              specialty: specialty || 'General Practitioner',
              address: buildAddress(el.tags),
              phone: el.tags.phone || el.tags['contact:phone'] || 'Not available',
              lat: coords.lat,
              lon: coords.lon,
              distanceKm: getDistanceKm(originLat, originLon, coords.lat, coords.lon).toFixed(2),
            };
          })
          .sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
          .slice(0, 15)
      );
    } catch (overpassError) {
      const fallbackQuery = specialty ? `${specialty} doctor` : 'doctor';
      const fallbackResults = await queryNominatim(fallbackQuery, originLat, originLon, radius);
      specialists = mapNominatimResults(fallbackResults, originLat, originLon, specialty || 'doctor')
        .map(({ website, openingHours, emergency, specialists: specialistTags, ...item }) => ({
          ...item,
          specialty: specialty || 'General Practitioner',
        }))
        .slice(0, 15);
    }

    res.json({ success: true, specialists });
  } catch (error) {
    console.error('Specialist search error:', error.message);
    res.status(502).json({ error: 'Failed to fetch specialists', details: error.message });
  }
});

module.exports = router;
