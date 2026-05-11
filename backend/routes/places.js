import express from 'express';

const router = express.Router();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const haversineKm = (a, b) => {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const buildMapsUrl = (placeId, fallbackQuery) =>
  placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}&query_place_id=${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`;

const buildRouteUrl = (origin, destination, fallbackQuery) => {
  const dest = destination
    ? `${destination.lat},${destination.lng}`
    : fallbackQuery;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${encodeURIComponent(dest)}`;
};

const buildOsmUrl = (destination, fallbackQuery) =>
  destination
    ? `https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=18/${destination.lat}/${destination.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(fallbackQuery)}`;

const buildOsmRouteUrl = (origin, destination, fallbackQuery) =>
  destination
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${destination.lat}%2C${destination.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(fallbackQuery)}`;

const loadOverpassPlaces = async ({ origin, query, radius }) => {
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["shop"~"furniture|doityourself|hardware|houseware|department_store"](around:${radius},${origin.lat},${origin.lng});
      way["shop"~"furniture|doityourself|hardware|houseware|department_store"](around:${radius},${origin.lat},${origin.lng});
      node["craft"="carpenter"](around:${radius},${origin.lat},${origin.lng});
      way["craft"="carpenter"](around:${radius},${origin.lat},${origin.lng});
    );
    out center tags 20;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: overpassQuery }),
  });

  if (!response.ok) throw new Error(`Overpass failed ${response.status}`);
  const payload = await response.json();

  const places = (payload.elements || [])
    .map((place) => {
      const destination =
        Number.isFinite(place.lat) && Number.isFinite(place.lon)
          ? { lat: place.lat, lng: place.lon }
          : place.center
            ? { lat: place.center.lat, lng: place.center.lon }
            : null;
      if (!destination) return null;

      const name = place.tags?.name || place.tags?.brand || `${query} store`;
      const address = [
        place.tags?.['addr:street'],
        place.tags?.['addr:city'],
        place.tags?.['addr:province'],
      ].filter(Boolean).join(', ');
      const fallbackQuery = `${name} ${address}`.trim();
      const distanceKm = haversineKm(origin, destination);

      return {
        placeId: `osm-${place.type}-${place.id}`,
        provider: 'OpenStreetMap',
        name,
        address,
        rating: null,
        userRatingsTotal: 0,
        openNow: null,
        lat: destination.lat,
        lng: destination.lng,
        distanceKm: Number(distanceKm.toFixed(2)),
        mapsUrl: buildOsmUrl(destination, fallbackQuery),
        routeUrl: buildOsmRouteUrl(origin, destination, fallbackQuery),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6);

  return places;
};

const loadNominatimPlaces = async ({ origin, query }) => {
  const delta = 0.09;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${query} furniture hardware store`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('viewbox', `${origin.lng - delta},${origin.lat + delta},${origin.lng + delta},${origin.lat - delta}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DreamDwell/1.0 local room design app',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Nominatim failed ${response.status}`);

  const payload = await response.json();
  return (payload || [])
    .map((place) => {
      const destination = { lat: Number(place.lat), lng: Number(place.lon) };
      if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
      const name = place.name || place.display_name?.split(',')?.[0] || `${query} store`;
      const fallbackQuery = place.display_name || name;
      const distanceKm = haversineKm(origin, destination);

      return {
        placeId: `nominatim-${place.osm_type}-${place.osm_id}`,
        provider: 'OpenStreetMap',
        name,
        address: place.display_name || '',
        rating: null,
        userRatingsTotal: 0,
        openNow: null,
        lat: destination.lat,
        lng: destination.lng,
        distanceKm: Number(distanceKm.toFixed(2)),
        mapsUrl: buildOsmUrl(destination, fallbackQuery),
        routeUrl: buildOsmRouteUrl(origin, destination, fallbackQuery),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6);
};

const loadFreeMapPlaces = async ({ origin, query, radius }) => {
  const failures = [];

  try {
    const places = await loadOverpassPlaces({ origin, query, radius });
    if (places.length) return { places, provider: 'OpenStreetMap Overpass' };
  } catch (error) {
    failures.push(error.message);
  }

  try {
    const places = await loadNominatimPlaces({ origin, query });
    if (places.length) return { places, provider: 'OpenStreetMap Nominatim' };
  } catch (error) {
    failures.push(error.message);
  }

  return { places: [], provider: 'OpenStreetMap', failures };
};

router.get('/nearby', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const lat = toNumber(req.query.lat);
  const lng = toNumber(req.query.lng);
  const query = String(req.query.query || 'furniture hardware store').slice(0, 120);
  const radius = Math.min(Math.max(toNumber(req.query.radius) || 8000, 1000), 30000);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'lat and lng are required.' });
  }

  const origin = { lat, lng };
  const textQuery = `${query} furniture hardware store`;

  if (!apiKey) {
    try {
      const { places, provider } = await loadFreeMapPlaces({ origin, query, radius });
      return res.json({
        query,
        origin,
        provider,
        notice: places.length
          ? `Using free ${provider} store results.`
          : 'No free map store results found. Use the search link below.',
        places,
      });
    } catch (error) {
      console.error('Overpass fallback error:', error);
      return res.status(502).json({
        error: 'Free nearby store lookup is unavailable right now.',
        userMessage: 'Free map lookup is unavailable. Use the search link below.',
      });
    }
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', textQuery);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(payload.status)) {
      const apiDenied = payload.status === 'REQUEST_DENIED' || /not authorized|API key/i.test(payload.error_message || '');
      if (apiDenied) {
        try {
          const { places, provider } = await loadFreeMapPlaces({ origin, query, radius });
          return res.json({
            query,
            origin,
            provider,
            places,
            notice: places.length
              ? `Google Places is not enabled, so DreamDwell used free ${provider} store results.`
              : 'Google Places is not enabled and no free map stores were found. Use the search link below.',
          });
        } catch (error) {
          console.error('Overpass fallback error:', error);
          return res.json({
            query,
            origin,
            places: [],
            notice: 'Google Places is not enabled and the free map fallback is unavailable. Use the search link below.',
            error: payload.status || 'Places lookup disabled.',
          });
        }
      }

      return res.status(502).json({
        error: payload.error_message || payload.status || 'Places lookup failed.',
        userMessage: 'Nearby store lookup is unavailable right now. Use the search link below.',
      });
    }

    const places = (payload.results || []).slice(0, 6).map((place) => {
      const destination = place.geometry?.location
        ? {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          }
        : null;
      const distanceKm = destination ? haversineKm(origin, destination) : null;
      const fallbackQuery = `${place.name || query} ${place.formatted_address || ''}`.trim();

      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating || null,
        userRatingsTotal: place.user_ratings_total || 0,
        openNow: place.opening_hours?.open_now ?? null,
        lat: destination?.lat ?? null,
        lng: destination?.lng ?? null,
        distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(2)),
        mapsUrl: buildMapsUrl(place.place_id, fallbackQuery),
        routeUrl: destination
          ? buildRouteUrl(origin, destination, fallbackQuery)
          : buildRouteUrl(origin, null, fallbackQuery),
      };
    });

    places.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    res.json({ query, origin, places });
  } catch (error) {
    console.error('Places nearby error:', error);
    res.status(500).json({ error: 'Could not load nearby stores.' });
  }
});

export default router;
