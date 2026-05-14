import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useAuth } from '../../context/AuthContext';
import DreamAIChat from '../../components/DreamAIChat';
import StatusPill from '../../components/StatusPill';
import FloatingAssistantChat from '../../components/FloatingAssistantChat';
import { API_BASE_URL } from '../../config/api';
import { persistLastScan } from '../../utils/dreamdwellContext';
import 'leaflet/dist/leaflet.css';

const STEP = { IDLE: 'idle', SOURCE: 'source', CAPTURE: 'capture', ANALYZING: 'analyzing', DONE: 'done' };
const GOOGLE_MAPS_EMBED_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const getSuggestionBounds = (suggestion, index = 0) => {
  if (Array.isArray(suggestion?.points) && suggestion.points.length === 4) {
    const xs = suggestion.points.map(([x]) => Number(x)).filter(Number.isFinite);
    const ys = suggestion.points.map(([, y]) => Number(y)).filter(Number.isFinite);
    if (xs.length === 4 && ys.length === 4) {
      return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
  }

  const fallbackZones = {
    ceiling: { left: 40, top: 7, width: 18, height: 9 },
    upper_wall: { left: 22 + (index % 3) * 18, top: 26, width: 16, height: 12 },
    lower_wall: { left: 18 + (index % 3) * 20, top: 50, width: 18, height: 13 },
    floor: { left: 18 + (index % 3) * 20, top: 72, width: 22, height: 14 },
  };

  return fallbackZones[suggestion?.targetSurface] || fallbackZones[suggestion?.zone] || fallbackZones.floor;
};

const buildStoreSearchUrl = (suggestion, coords) => {
  const location = coords ? ` ${coords.lat},${coords.lng}` : '';
  return `https://www.lazada.com.ph/catalog/?q=${encodeURIComponent(`${suggestion?.item || 'furniture'} home decor${location}`)}`;
};

const buildRouteUrl = (suggestion, coords) => {
  const origin = coords ? `&origin=${coords.lat},${coords.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(`${suggestion?.item || 'furniture'} store near me`)}`;
};

const imageFallbackUrl = (label = 'Product') =>
  `https://placehold.co/640x480/e8edf5/2f3747?text=${encodeURIComponent(label)}`;

const storeLogoUrl = (store = '') => {
  const key = store.toLowerCase();
  const logos = [
    { pattern: /ikea/, text: 'IKEA', bg: '#0058a3', fg: '#ffda1a', sub: 'Philippines' },
    { pattern: /mandaue/, text: 'Mandaue Foam', bg: '#163b6d', fg: '#ffffff', sub: 'Furniture' },
    { pattern: /allhome/, text: 'AllHome', bg: '#ffffff', fg: '#2f3747', sub: 'Home Improvement' },
    { pattern: /lazada/, text: 'Lazada', bg: '#f36f21', fg: '#ffffff', sub: 'Philippines' },
    { pattern: /shopee/, text: 'Shopee', bg: '#ee4d2d', fg: '#ffffff', sub: 'Philippines' },
  ];
  const logo = logos.find((item) => item.pattern.test(key)) || {
    text: store || 'Store',
    bg: '#e8edf5',
    fg: '#2f3747',
    sub: 'Store',
  };
  const safeText = logo.text.replace(/&/g, '&amp;');
  const safeSub = logo.sub.replace(/&/g, '&amp;');
  const fontSize = safeText.length > 12 ? 34 : 46;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" rx="34" fill="${logo.bg}"/>
      <rect x="34" y="34" width="572" height="352" rx="28" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <text x="320" y="200" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="${logo.fg}">${safeText}</text>
      <text x="320" y="248" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="${logo.fg}" opacity="0.82">${safeSub}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const buildRoutePreview = (place, coords, fallbackSuggestion, status = '', places = []) => {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (coords) {
      return {
        title: `${fallbackSuggestion?.item || 'Store'} near you`,
        origin: coords,
        destination: null,
        routeUrl: buildRouteUrl(fallbackSuggestion, coords),
        needsStore: true,
        status,
        places,
      };
    }
    return {
      title: fallbackSuggestion?.item || 'Store route',
      origin: coords || null,
      destination: null,
      routeUrl: place?.routeUrl || buildRouteUrl(fallbackSuggestion, coords),
      needsStore: true,
      status,
      places,
    };
  }

  return {
    title: place?.name || fallbackSuggestion?.item || 'Store route',
    origin: coords || null,
    destination: { lat, lng },
    places,
    routeUrl:
      place?.routeUrl ||
      (coords
        ? `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`),
  };
};

const makeSuggestionFromText = (text, index) => {
  const item = text
    .replace(/^(add|put|include|place)\s+/i, '')
    .replace(/\s+(please|pls)$/i, '')
    .trim() || 'New item';
  const left = 18 + (index % 3) * 22;
  const top = index % 2 ? 50 : 72;

  return {
    item,
    reason: 'Added from your chat request.',
    price_php: 'Price varies',
    distance: 'Nearby store search',
    targetSurface: top > 65 ? 'floor' : 'lower_wall',
    zone: top > 65 ? 'floor' : 'lower_wall',
    placementLabel: top > 65 ? 'Place on the open floor area' : 'Place along the lower wall area',
    confidence: 'user-requested',
    points: [
      [left, top],
      [left + 18, top],
      [left + 18, top + 12],
      [left, top + 12],
    ],
  };
};

function RouteMap({ routePreview }) {
  const [routeLine, setRouteLine] = useState([]);
  const [routeInfo, setRouteInfo] = useState('');
  const origin = routePreview?.origin;
  const destination = routePreview?.destination;
  const storePins = routePreview?.places?.length
    ? routePreview.places
    : destination
      ? [{ name: routePreview.title, lat: destination.lat, lng: destination.lng, routeUrl: routePreview.routeUrl }]
      : [];
  const googleEmbedUrl = GOOGLE_MAPS_EMBED_KEY && origin && destination
    ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(GOOGLE_MAPS_EMBED_KEY)}&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving`
    : '';

  useEffect(() => {
    let ignore = false;
    setRouteLine([]);
    setRouteInfo('');

    if (!origin || !destination) return;

    const loadRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        const route = data.routes?.[0];
        if (!route || ignore) return;
        setRouteLine(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        const km = (route.distance / 1000).toFixed(1);
        const mins = Math.round(route.duration / 60);
        setRouteInfo(`${km} km | about ${mins} min drive`);
      } catch (_error) {
        if (!ignore) setRouteInfo('Route line could not load, but the store location is shown.');
      }
    };

    loadRoute();
    return () => {
      ignore = true;
    };
  }, [origin, destination]);

  const center = destination || origin;
  if (!center) {
    return (
      <div style={{ padding: 24, border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text-muted)' }}>
        Route preview needs location permission and a store result.
      </div>
    );
  }

  return (
    <div>
      {routePreview.status && (
        <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{routePreview.status}</p>
      )}
      {origin?.accuracy && (
        <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Your browser reports location accuracy around {Math.round(origin.accuracy)} meters.
        </p>
      )}
      {routeInfo && <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{routeInfo}</p>}
      <div style={{ height: 380, border: '1px solid var(--glass-border)', borderRadius: 12, overflow: 'hidden' }}>
        {googleEmbedUrl && !routePreview.needsStore ? (
          <iframe
            title={`Google route to ${routePreview.title}`}
            src={googleEmbedUrl}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <MapContainer center={[center.lat, center.lng]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {origin && (
              <>
                {origin.accuracy && (
                  <Circle
                    center={[origin.lat, origin.lng]}
                    radius={origin.accuracy}
                    pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.08, weight: 1 }}
                  />
                )}
                <CircleMarker center={[origin.lat, origin.lng]} radius={8} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.9 }}>
                  <Popup>Your location{origin.accuracy ? ` (${Math.round(origin.accuracy)}m accuracy)` : ''}</Popup>
                </CircleMarker>
              </>
            )}
            {storePins.map((place) => (
              <CircleMarker
                key={place.placeId || place.name || `${place.lat}-${place.lng}`}
                center={[Number(place.lat), Number(place.lng)]}
                radius={8}
                pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.9 }}
              >
                <Popup>
                  <strong>{place.name || routePreview.title}</strong>
                  {place.distanceKm !== null && place.distanceKm !== undefined ? <><br />{place.distanceKm} km away</> : null}
                </Popup>
              </CircleMarker>
            ))}
            {routeLine.length > 0 && <Polyline positions={routeLine} pathOptions={{ color: '#7c3aed', weight: 5, opacity: 0.85 }} />}
          </MapContainer>
          )}
      </div>
    </div>
  );
}

const buildRecreatedSceneUrl = (result) => {
  if (result?.source_recreation_prompt) {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(String(result.source_recreation_prompt).replace(/\s+/g, ' ').trim().slice(0, 1200))}?width=1024&height=1024&nologo=true&seed=42`;
  }

  const baseScene = result?.analysis_summary || result?.explanation || 'an empty room';
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];

  // Build concise suggestion list
  const suggestionItems = suggestions
    .slice(0, 6)
    .map((item) => {
      const placement = item.placementLabel || item.targetSurface || 'the room';
      return `${item.item} at ${placement}`;
    })
    .join(', ');

  // Build a concise, direct prompt optimized for Pollinations
  const promptText = suggestionItems
    ? `${baseScene}, with ${suggestionItems}. Interior design render, realistic, 8k, professional photography`
    : `${baseScene}. Interior design render, realistic, 8k, professional photography`;

  console.log('Generated Pollinations prompt:', promptText);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}`;
};

export default function VoiceCore({ user }) {
  const { user: authUser } = useAuth();

  const [step, setStep] = useState(STEP.IDLE);
  const [inputMode, setInputMode] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [chatTranscript, setChatTranscript] = useState([]);
  const [archiveStatus, setArchiveStatus] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const analyzeTimerRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageDataUrl(ev.target.result);
      setImageBase64(ev.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGetStarted = () => {
    setError('');
    setStep(STEP.SOURCE);
  };

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => { videoRef.current.onloadedmetadata = () => resolve(); });
        await new Promise((r) => setTimeout(r, 600));
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const url = canvas.toDataURL('image/jpeg', 0.85);
        setImageDataUrl(url);
        setImageBase64(url);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera access denied. Try uploading a photo instead.');
    }
  }, []);

  const handleSelectSource = async (mode) => {
    setInputMode(mode);
    setError('');
    setStep(STEP.SOURCE);
    if (mode === 'webcam') {
      await startCamera();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64 || !authUser) return;
    setError('');
    setStep(STEP.ANALYZING);
    setAnalyzing(true);
    setAnalyzeProgress(0);

    let p = 0;
    analyzeTimerRef.current = setInterval(() => {
      p = Math.min(p + Math.random() * 18, 88);
      setAnalyzeProgress(Math.round(p));
    }, 400);

    try {
      const token = authUser?.accessToken;
      const response = await fetch(`${API_BASE_URL}/api/rooms/audit-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64,
          profile: {
            uid: authUser.uid,
            email: authUser.email,
            aiSettings: JSON.parse(localStorage.getItem('dreamdwellAiSettings') || '{}'),
            interfaceSettings: JSON.parse(localStorage.getItem('dreamdwellInterfaceSettings') || '{}'),
          },
        }),
      });
      clearInterval(analyzeTimerRef.current);
      setAnalyzeProgress(100);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Analysis failed');
      }
      const result = await response.json();
      result._imageUrl = imageDataUrl;
      result.recreatedImageUrl = result.generated_scene_url || result.local_recreated_scene || buildRecreatedSceneUrl(result);
      setScanResult(result);
      persistLastScan(result, authUser.uid);

      try {
        setArchiveStatus('Saving to archive...');
        await fetch(`${API_BASE_URL}/api/sessions/save-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            summary: result.analysis_summary || result.explanation || 'Room analysis complete.',
            suggestions: JSON.stringify({
              analysis_summary: result.analysis_summary || result.explanation,
              audit: result.audit,
              added_elements: result.added_elements,
              suggestions: result.suggestions || [],
              zones: result.zones,
              geometry: result.geometry,
              chat: chatTranscript,
              render_provider: 'pollinations-text-render',
              source_recreation_prompt: result.source_recreation_prompt,
              generated_scene_url: result.recreatedImageUrl,
              local_recreated_scene: result.local_recreated_scene,
              fallback_image_url: imageDataUrl,
            }),
            imageUrl: result.recreatedImageUrl || imageDataUrl,
            style: result.geometry?.inferredRoomType || 'Room',
            goal: 'ROOM_ANALYSIS',
          }),
        });
        setArchiveStatus('Saved to archive');
      } catch (_archiveError) {
        setArchiveStatus('Archive save failed');
      }

      stopCamera();
      setStep(STEP.DONE);
    } catch (err) {
      clearInterval(analyzeTimerRef.current);
      console.error('Scan error:', err);
      setError(err.message || 'Analysis failed. Make sure the backend is running.');
      setStep(STEP.SOURCE);
    } finally {
      setAnalyzing(false);
    }
  }, [imageBase64, imageDataUrl, authUser, chatTranscript, stopCamera]);

  const handleNewScan = () => {
    stopCamera();
    setImageDataUrl(null);
    setImageBase64(null);
    setInputMode(null);
    setScanResult(null);
    setError('');
    setAnalyzeProgress(0);
    setStep(STEP.SOURCE);
  };

  const handleSuggestionRevision = useCallback((message) => {
    const text = `${message || ''}`.trim();
    const lower = text.toLowerCase();
    if (!text || !scanResult?.suggestions) return null;

    let note = null;

    setScanResult((current) => {
      if (!current?.suggestions) return current;
      let nextSuggestions = current.suggestions;

      const removeMatch = lower.match(/\b(remove|delete|take out|hide)\s+(.+)/);
      const addMatch = lower.match(/\b(add|put|include|place)\s+(.+)/);
      const colorMatch = lower.match(/\b(change|make|switch).*\b(color|palette|colour)\b.*\b(to|into)\s+(.+)/);

      if (removeMatch) {
        const target = removeMatch[2].replace(/[.?!]/g, '').trim();
        nextSuggestions = current.suggestions.filter(
          (item) => !item.item?.toLowerCase().includes(target)
        );
        note = `Removed "${target}" from the suggestions.`;
      } else if (addMatch) {
        const itemText = addMatch[2].replace(/[.?!]/g, '').trim();
        nextSuggestions = [...current.suggestions, makeSuggestionFromText(itemText, current.suggestions.length)];
        note = `Added "${itemText}" and placed it in an available area.`;
      } else if (colorMatch) {
        const palette = colorMatch[4].replace(/[.?!]/g, '').trim();
        nextSuggestions = current.suggestions.map((item) => ({
          ...item,
          reason: `${item.reason || 'Suggested item.'} Palette adjusted toward ${palette}.`,
          palette,
        }));
        note = `Updated the suggestion palette toward ${palette}.`;
      }

      if (nextSuggestions === current.suggestions) return current;

      return {
        ...current,
        suggestions: nextSuggestions,
        added_elements: nextSuggestions.map((item) => item.item),
        analysis_summary: current.analysis_summary || current.explanation,
      };
    });

    return note;
  }, [scanResult]);

  const handleBackFromSource = () => setStep(STEP.IDLE);

  if (step === STEP.IDLE) return <IdleView onGetStarted={handleGetStarted} user={user} />;
  if (step === STEP.SOURCE || step === STEP.CAPTURE) return (
    <SourceCaptureView
      imageDataUrl={imageDataUrl}
      inputMode={inputMode}
      onAnalyze={handleAnalyze}
      onBack={handleBackFromSource}
      onSelect={handleSelectSource}
      onRetry={() => fileInputRef.current?.click()}
      error={error}
      fileInputRef={fileInputRef}
      handleFileChange={handleFileChange}
      videoRef={videoRef}
      canvasRef={canvasRef}
    />
  );
  if (step === STEP.ANALYZING) return <AnalyzingView progress={analyzeProgress} />;
  if (step === STEP.DONE) return <DoneView scanResult={scanResult} imageDataUrl={imageDataUrl} onNewScan={handleNewScan} user={user} authUser={authUser} fileInputRef={fileInputRef} handleFileChange={handleFileChange} videoRef={videoRef} canvasRef={canvasRef} onChatMessagesChange={setChatTranscript} onSuggestionRevision={handleSuggestionRevision} archiveStatus={archiveStatus} />;

  return null;
}

// ── IDLE ──────────────────────────────────────────────────────────────

const SLIDESHOW_PHOTOS = [
  { url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=85', label: 'Living Room', style: 'Minimalist' },
  { url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&q=85', label: 'Bedroom', style: 'Minimalist' },
  { url: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=1600&q=85', label: 'Living Room', style: 'Scandinavian' },
  { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85', label: 'Dining Room', style: 'Modern' },
  { url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1600&q=85', label: 'Kitchen', style: 'Contemporary' },
  { url: 'https://images.unsplash.com/photo-1584622050111-993a426fbf0a?auto=format&fit=crop&w=1600&q=85', label: 'Bedroom', style: 'Bohemian' },
];

function IdleView({ onGetStarted, user }) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDESHOW_PHOTOS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      flex: 1,
      width: '100%',
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: 'minmax(420px, 1.08fr) minmax(360px, 0.72fr)',
      overflow: 'hidden',
      background: 'var(--bg-1)',
      borderRadius: 10,
    }}>
      {/* ── LEFT: Full-bleed slideshow with centered text overlay ── */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Slideshow images */}
        {SLIDESHOW_PHOTOS.map((photo, index) => (
          <div
            key={photo.url}
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${photo.url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: index === activeSlide ? 1 : 0,
              transform: `scale(${index === activeSlide ? 1 : 1.03})`,
              transition: `opacity 1s ease-in-out, transform 7s ease-in-out`,
              zIndex: index === activeSlide ? 1 : 0,
            }}
          />
        ))}

        {/* Dark gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.1) 100%)',
          zIndex: 2,
        }} />

        {/* Dot indicators */}
        <div style={{
          position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 4,
        }}>
          {SLIDESHOW_PHOTOS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === activeSlide ? 20 : 6, height: 6,
                borderRadius: 999, background: i === activeSlide ? 'white' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.35s ease',
              }}
            />
          ))}
        </div>

        {/* Bottom left: style badge */}
        <div style={{ position: 'absolute', bottom: 20, left: 28, zIndex: 4 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
            color: 'rgba(255,255,255,0.9)', fontSize: '0.62rem', fontWeight: 600,
            letterSpacing: '0.4px',
          }}>
            {SLIDESHOW_PHOTOS[activeSlide].style}
          </span>
        </div>

        {/* Centered content overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', justifyContent: 'center',
          padding: 'clamp(28px, 5vw, 64px)',
          zIndex: 3,
        }}>
          <div style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'rgba(255,255,255,0.9)',
                boxShadow: '0 0 10px rgba(255,255,255,0.5)',
              }} />
              <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '1.2px', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>DreamDwell</span>
            </div>
            <h1 style={{
              margin: '0 0 12px', fontSize: 'clamp(2.4rem, 4vw, 4.1rem)', fontWeight: 750,
              color: 'white', letterSpacing: 0, lineHeight: 1.02,
            }}>
              Your Room,<br />Analyzed.
            </h1>
            <p style={{
              margin: '0 0 26px', fontSize: '0.98rem', color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.65, maxWidth: 390,
            }}>
              Upload a photo. AI detects furniture, suggests improvements, and links local shop prices.
            </p>
            <button
              className="btn-primary"
              onClick={onGetStarted}
              style={{ padding: '14px 34px', fontSize: '0.92rem', borderRadius: 10 }}
            >
              Analyze a Room
            </button>
            {/* How it works */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(88px, 1fr))', gap: 0, marginTop: 34, maxWidth: 410 }}>
              {[['01', 'Upload', 'Pick or snap'], ['02', 'Analyze', 'AI reads room'], ['03', 'Shop', 'Local links']].map(([n, l, s], i) => (
                <div key={n} style={{ flex: 1, borderRight: i < 2 ? '1px solid rgba(255,255,255,0.18)' : 'none', paddingRight: 14 }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 1 }}>{n}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: 1 }}>{l}</div>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Archi Chat ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        background: 'var(--bg-1)',
      }}>
        {/* Chat header */}
        <div style={{ padding: '26px 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.7px' }}>ASK ARCHI</span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Your AI room design assistant
          </p>
        </div>

        {/* Chat area — no outer box, FloatingAssistantChat handles its own styling */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 24px 24px',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          <FloatingAssistantChat
            user={user}
            page="/voice-core"
            defaultOpen
            variant="docked"
            scanContext={{}}
          />
        </div>
      </div>
    </div>
  );
}

// ── SOURCE CHOICE ─────────────────────────────────────────────────────

function SourceCaptureView({
  imageDataUrl,
  inputMode,
  onAnalyze,
  onRetry,
  onSelect,
  error,
  fileInputRef,
  handleFileChange,
  videoRef,
  canvasRef,
}) {
  const hasSelection = Boolean(inputMode);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: 24, overflow: 'hidden' }}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      <video ref={videoRef} autoPlay muted playsInline style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {hasSelection ? 'Preview your room photo' : 'Choose your room photo source'}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: hasSelection
            ? 'minmax(170px, 220px) minmax(360px, 1fr)'
            : 'minmax(280px, 620px) minmax(0, 0fr)',
          gap: hasSelection ? 20 : 0,
          alignItems: 'stretch',
          justifyContent: 'center',
          transition: 'grid-template-columns 0.45s ease, gap 0.45s ease',
        }}
      >
        <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: hasSelection ? 'flex-start' : 'center', gap: hasSelection ? 12 : 18, paddingTop: hasSelection ? 34 : 0 }}>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: hasSelection ? '1rem' : '1.45rem' }}>
              How do you want to scan?
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: hasSelection ? '0.72rem' : '0.85rem', lineHeight: 1.55 }}>
              {hasSelection ? 'Switch source anytime.' : 'Pick webcam or upload. Your selected room image will slide in beside these options.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: hasSelection ? '1fr' : 'repeat(2, minmax(160px, 1fr))', gap: hasSelection ? 10 : 14 }}>
            <SourceCard
              icon={<WebcamIcon />}
              label="Use Webcam"
              description="Capture live view"
              active={inputMode === 'webcam'}
              compact={hasSelection}
              onClick={() => onSelect('webcam')}
            />
            <SourceCard
              icon={<UploadIcon />}
              label="Upload Photo"
              description="Choose from gallery"
              active={inputMode === 'upload'}
              compact={hasSelection}
              onClick={() => onSelect('upload')}
            />
          </div>
        </section>

        <section
          style={{
            minWidth: 0,
            display: 'flex',
            minHeight: 0,
            overflow: 'hidden',
            opacity: hasSelection ? 1 : 0,
            transform: hasSelection ? 'translateX(0)' : 'translateX(32px)',
            pointerEvents: hasSelection ? 'auto' : 'none',
            transition: 'opacity 0.35s ease 0.08s, transform 0.45s ease',
          }}
        >
          <CaptureView
            imageDataUrl={imageDataUrl}
            inputMode={inputMode}
            onAnalyze={onAnalyze}
            onRetry={onRetry}
            error={error}
          />
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function SourceView({ onSelect, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="ghost-btn" onClick={onBack}>← Back</button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Step 1 of 2</span>
      </div>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        How would you like to provide your room photo?
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <SourceCard
          icon={<WebcamIcon />}
          label="Use Webcam"
          description="Capture live view"
          onClick={() => onSelect('webcam')}
        />
        <SourceCard
          icon={<UploadIcon />}
          label="Upload Photo"
          description="Choose from gallery"
          onClick={() => onSelect('upload')}
        />
      </div>
    </div>
  );
}

function SourceCard({ icon, label, description, active = false, compact = false, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: compact ? 'flex-start' : 'center',
        textAlign: compact ? 'left' : 'center',
        gap: compact ? 10 : 10,
        padding: compact ? '12px 14px' : '28px 40px',
        border: '1.5px solid var(--glass-border)',
        borderRadius: compact ? 12 : 16,
        background: active ? 'rgba(139,92,246,0.12)' : 'var(--surface)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        minWidth: compact ? 0 : 160,
        minHeight: compact ? 68 : 178,
        transition: 'all 0.2s',
        fontFamily: "'Space Grotesk', sans-serif",
        boxShadow: active ? '0 0 0 1px var(--accent) inset' : 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.color = 'var(--accent)';
        e.currentTarget.style.background = 'rgba(139,92,246,0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = active ? 'var(--accent)' : 'var(--glass-border)';
        e.currentTarget.style.color = active ? 'var(--accent)' : 'var(--text-muted)';
        e.currentTarget.style.background = active ? 'rgba(139,92,246,0.12)' : 'var(--surface)';
      }}
    >
      <span style={{ color: 'inherit', display: 'flex', flexShrink: 0, transform: compact ? 'scale(0.78)' : 'none' }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 8, minWidth: 0 }}>
        <span style={{ fontSize: compact ? '0.78rem' : '0.9rem', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: compact ? '0.66rem' : '0.75rem', opacity: 0.7, lineHeight: 1.25 }}>{description}</span>
      </span>
    </button>
  );
}

function WebcamIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

// ── CAPTURE PREVIEW ───────────────────────────────────────────────────

function CaptureView({ imageDataUrl, inputMode, onAnalyze, onRetry, error, videoRef, canvasRef }) {
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (imageDataUrl) {
      const t = setTimeout(() => setPreviewReady(true), 250);
      return () => clearTimeout(t);
    }
    setPreviewReady(false);
  }, [imageDataUrl]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Step 2 of 2</span>
      </div>

      <div style={{
        flex: 1, borderRadius: 16, overflow: 'hidden', background: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260,
      }}>
        {imageDataUrl ? (
          <img src={imageDataUrl} alt="Room preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{inputMode === 'webcam' ? '📷' : '📁'}</div>
            <span>{inputMode === 'webcam' ? 'Opening camera...' : 'Select an image...'}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 8, color: '#ff8080', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}
        {imageDataUrl && previewReady && (
          <button className="btn-primary" onClick={onAnalyze} style={{ width: '100%', padding: '14px' }}>
            Analyze Room
          </button>
        )}
        <button className="ghost-btn" onClick={onRetry} style={{ width: '100%' }}>
          {imageDataUrl ? 'Change photo' : 'Choose a photo'}
        </button>
      </div>
    </div>
  );
}

// ── ANALYZING ──────────────────────────────────────────────────────────

function AnalyzingView({ progress }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 40 }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)',
          opacity: 0.3, animation: 'ping 1.8s ease-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 12, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(139,92,246,0.5)',
        }}>
          <span style={{ fontSize: '1.3rem' }}>🔍</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Analyzing your room</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Detecting furniture, layout, and lighting...
        </p>
      </div>
      <div style={{ width: '100%', maxWidth: 260 }}>
        <div style={{ height: 4, borderRadius: 999, background: 'var(--glass-border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--accent), #8b5cf6)',
            borderRadius: 999, transition: 'width 0.4s ease',
          }} />
        </div>
        <p style={{ textAlign: 'center', margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {progress < 100 ? `${progress}% complete` : 'Finalizing results...'}
        </p>
      </div>
    </div>
  );
}

// ── DONE (Results) ─────────────────────────────────────────────────────

function DoneView({ scanResult, imageDataUrl, onNewScan, user, authUser, onChatMessagesChange, onSuggestionRevision, archiveStatus }) {
  const [showAll, setShowAll] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);
  const [coords, setCoords] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [onlineProducts, setOnlineProducts] = useState([]);
  const [productsStatus, setProductsStatus] = useState('');
  const [routePreview, setRoutePreview] = useState(null);
  const [storePreview, setStorePreview] = useState(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(Number(scanResult?.geometry?.aspectRatio) || 16 / 9);
  const visibleSuggestions = scanResult?.suggestions || [];

  const fetchNearbyPlacesFor = useCallback(async (suggestion, signal) => {
    if (!coords) return [];
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      query: suggestion?.item || 'furniture',
    });
    const response = await fetch(`${API_BASE_URL}/api/places/nearby?${params}`, { signal });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.userMessage || data.error || 'Nearby store lookup failed.');
    }
    return Array.isArray(data.places) ? data.places : [];
  }, [coords]);

  const openStoreSearch = useCallback((suggestion) => {
    setSelectedShop(suggestion);
    setStorePreview({
      title: `${suggestion.item} store search`,
      url: buildStoreSearchUrl(suggestion, coords),
    });
  }, [coords]);

  const openRoute = useCallback(async (suggestion) => {
    if (!coords) {
      setRoutePreview(buildRoutePreview(null, coords, suggestion, 'Route preview needs location permission.'));
      return;
    }

    setRoutePreview(buildRoutePreview(null, coords, suggestion, 'Checking Google Maps for nearby stores...', []));

    try {
      const places = await fetchNearbyPlacesFor(suggestion);
      if (places[0]) {
        setRoutePreview(buildRoutePreview(places[0], coords, suggestion, '', places));
        return;
      }
      setRoutePreview(buildRoutePreview(null, coords, suggestion, 'No Google Maps store results were found nearby. The map is centered on your reported live location.', []));
    } catch (error) {
      setRoutePreview(buildRoutePreview(null, coords, suggestion, error.message || 'Google Maps lookup is unavailable right now.', []));
    }
  }, [coords, fetchNearbyPlacesFor]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
        accuracy: Math.round(position.coords.accuracy || 0),
      }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (!selectedShop || !coords) {
      if (!selectedShop) {
        setNearbyPlaces([]);
        setOnlineProducts([]);
        setProductsStatus('');
        return;
      }
    }

    const controller = new AbortController();

    const loadShoppingData = async () => {
      if (coords) {
        setNearbyPlaces([]);
      }
      setProductsStatus('Loading online store products...');
      setOnlineProducts([]);

      if (coords) {
        try {
          const params = new URLSearchParams({
            lat: String(coords.lat),
            lng: String(coords.lng),
            query: selectedShop.item || 'furniture',
          });
          const response = await fetch(`${API_BASE_URL}/api/places/nearby?${params}`, {
            signal: controller.signal,
          });
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('Nearby store API is not reachable. Restart the backend and check REACT_APP_API_BASE_URL.');
          }
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.userMessage || data.error || 'Nearby store lookup failed.');
          }
          setNearbyPlaces(Array.isArray(data.places) ? data.places : []);
        } catch (error) {
          if (error.name !== 'AbortError') {
            setNearbyPlaces([]);
          }
        }
      }

      try {
        const productParams = new URLSearchParams({
          query: selectedShop.item || 'furniture',
          price: String(selectedShop.price_value || ''),
        });
        const productResponse = await fetch(`${API_BASE_URL}/api/places/online-stores?${productParams}`, {
          signal: controller.signal,
        });
        const productData = await productResponse.json();
        if (!productResponse.ok) {
          throw new Error(productData.error || 'Online store lookup failed.');
        }
        setOnlineProducts(Array.isArray(productData.products) ? productData.products : []);
        setProductsStatus('');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setProductsStatus(error.message || 'Online store products are unavailable.');
        }
      }
    };

    loadShoppingData();
    return () => controller.abort();
  }, [coords, selectedShop]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill
            label={scanResult?.geometry?.inferredRoomType || 'Room'}
            value={scanResult?.geometry?.confidence || '—'}
            tone={scanResult?.geometry?.confidence === 'high' ? 'success' : 'default'}
          />
          {scanResult?.geometry?.perspective && (
            <StatusPill label="view" value={scanResult?.geometry?.perspective} tone="info" />
          )}
        </div>
        <button className="ghost-btn" onClick={onNewScan} style={{ fontSize: '0.78rem' }}>
          New scan →
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', height: 'min(45vh, 430px)', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
            {imageDataUrl && (
              <div style={{ position: 'relative', height: '100%', maxWidth: '100%', aspectRatio: imageAspectRatio }}>
                <img
                  src={imageDataUrl}
                  alt="Scanned room"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth && naturalHeight) setImageAspectRatio(naturalWidth / naturalHeight);
                  }}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                />
                {visibleSuggestions.slice(0, 6).map((suggestion, index) => {
                  const box = getSuggestionBounds(suggestion, index);
                  return (
                    <button
                      key={`${suggestion.item}-${index}`}
                      type="button"
                      title={suggestion.placementLabel || suggestion.reason}
                      style={{
                        position: 'absolute',
                        left: `${box.left}%`,
                        top: `${box.top}%`,
                        width: `${Math.max(box.width, 8)}%`,
                        height: `${Math.max(box.height, 8)}%`,
                        border: suggestion.points ? '2px solid var(--accent)' : '2px dashed rgba(255,255,255,0.75)',
                        borderRadius: 8,
                        background: 'rgba(139,92,246,0.14)',
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                      }}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', overflow: 'hidden', flex: 1 }}>
            <p style={{
              margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical',
            }}>
              {scanResult?.explanation || scanResult?.analysis_summary || 'Analysis complete.'}
            </p>
            {archiveStatus && (
              <p style={{ margin: '8px 0 0', fontSize: '0.7rem', color: 'var(--accent)' }}>
                {archiveStatus}
              </p>
            )}
          </div>
        </div>
        <div style={{ flex: '0 0 300px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <DreamAIChat
            scanResult={scanResult}
            userContext={{ uid: authUser?.uid, email: authUser?.email }}
            onMessagesChange={onChatMessagesChange}
            onSuggestionRevision={onSuggestionRevision}
          />
        </div>
      </div>

      {scanResult?.suggestions?.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', flexShrink: 0, maxHeight: showAll ? 320 : 170, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--accent)' }}>
              Suggestions ({scanResult.suggestions.length})
            </h3>
            <button onClick={() => setShowAll(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
              {showAll ? 'Show less' : `Show all`}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: showAll ? 240 : 100 }}>
              {(showAll ? scanResult.suggestions : scanResult.suggestions.slice(0, 3)).map((s, i) => (
                <SuggestionRow key={`${s.item}-${i}`} s={s} index={i} onShop={() => openStoreSearch(s)} onRoute={() => openRoute(s)} />
              ))}
            </div>
          </div>
        </div>
      )}
      {routePreview && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(10,12,18,0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setRoutePreview(null)}
        >
          <section
            className="glass-panel"
            style={{ width: 'min(760px, 100%)', maxHeight: '82vh', padding: 16, overflow: 'hidden' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{routePreview.title}</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Route preview</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setRoutePreview(null)}>Close</button>
            </div>
            <RouteMap routePreview={routePreview} />
            <a href={routePreview.routeUrl} target="_blank" rel="noreferrer" className="ghost-btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Open full route
            </a>
          </section>
        </div>
      )}
      {storePreview && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(10,12,18,0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setStorePreview(null)}
        >
          <section
            className="glass-panel"
            style={{ width: 'min(860px, 100%)', maxHeight: '86vh', padding: 16, overflow: 'hidden' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedShop?.item || storePreview.title} store search</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Search preview</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setStorePreview(null)}>Close</button>
            </div>
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: 12, padding: 14, minHeight: 320, background: 'rgba(255,255,255,0.04)', display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 14, overflow: 'hidden' }}>
              <div style={{ borderRight: '1px solid var(--glass-border)', paddingRight: 12, overflowY: 'auto' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Suggested items</h4>
                {(scanResult?.suggestions || []).map((item, index) => (
                  <button
                    key={`${item.item}-${index}`}
                    type="button"
                    onClick={() => setSelectedShop(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: selectedShop?.item === item.item ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                      background: selectedShop?.item === item.item ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                      color: 'inherit',
                      borderRadius: 8,
                      padding: '8px 9px',
                      marginBottom: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '0.75rem' }}>{item.item}</strong>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem' }}>{item.price_php || 'Price varies'}</span>
                  </button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', minWidth: 0 }}>
                {productsStatus && (
                  <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>{productsStatus}</p>
                )}
                {onlineProducts.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                    {onlineProducts.map((product) => (
                      <a
                        key={product.id}
                        href={product.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', border: '1px solid var(--glass-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}
                      >
                        <img
                          src={storeLogoUrl(product.store)}
                          alt={product.productName}
                          onError={(event) => {
                            event.currentTarget.src = imageFallbackUrl(product.store);
                          }}
                          style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'contain', display: 'block', padding: 20, background: 'rgba(255,255,255,0.38)' }}
                        />
                        <div style={{ padding: 10 }}>
                          <strong style={{ display: 'block', fontSize: '0.78rem', marginBottom: 4 }}>{product.store}</strong>
                          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.4 }}>{product.productName}</span>
                          <span style={{ display: 'block', color: 'var(--accent)', fontSize: '0.76rem', marginTop: 6 }}>{product.price}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : null}
                {nearbyPlaces.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {nearbyPlaces.map((place) => (
                      <article key={place.placeId || place.name} style={{ padding: 12, border: '1px solid var(--glass-border)', borderRadius: 10, background: 'var(--surface)' }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>{place.name}</strong>
                        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                          {place.distanceKm !== null ? `${place.distanceKm} km | ` : ''}
                          {place.address || 'Address unavailable'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setStorePreview(null);
                            setRoutePreview(buildRoutePreview(place, coords, selectedShop));
                          }}
                          className="ghost-btn"
                          style={{ marginTop: 8, fontSize: '0.72rem' }}
                        >
                          Preview route
                        </button>
                      </article>
                    ))}
                  </div>
                ) : !onlineProducts.length && !productsStatus ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {storePreview.status || 'No in-app store results are available. You can still open the full search.'}
                  </p>
                ) : null}
              </div>
            </div>
            <a href={buildStoreSearchUrl(selectedShop, coords)} target="_blank" rel="noreferrer" className="ghost-btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Open full search
            </a>
          </section>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ s, index = 0, onShop, onRoute }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, flexShrink: 0,
      }}>
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.item}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.distance ? `${s.distance} · ` : ''}{s.price_php || ''}
        </div>
      </div>
      <button type="button" onClick={onRoute} style={{
          padding: '4px 10px', border: '1px solid var(--glass-border)', color: 'var(--text-muted)',
          borderRadius: 6, textDecoration: 'none', fontSize: '0.7rem', flexShrink: 0,
          background: 'transparent', cursor: 'pointer',
        }}>
        Route
      </button>
      <button type="button" onClick={onShop} style={{
          padding: '4px 10px', border: '1px solid var(--accent)', color: 'var(--accent)',
          borderRadius: 6, textDecoration: 'none', fontSize: '0.7rem', flexShrink: 0,
          background: 'transparent', cursor: 'pointer',
        }}>
        Shop
      </button>
    </div>
  );
}
