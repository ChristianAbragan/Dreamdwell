import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useAuth } from '../../context/AuthContext';
import DreamAIChat from '../../components/DreamAIChat';
import StatusPill from '../../components/StatusPill';
import FloatingAssistantChat from '../../components/FloatingAssistantChat';
import { API_BASE_URL } from '../../config/api';
import { persistLastScan } from '../../utils/dreamdwellContext';
import 'leaflet/dist/leaflet.css';

const STEP = { IDLE: 'idle', SOURCE: 'source', CAPTURE: 'capture', ANALYZING: 'analyzing', DONE: 'done' };

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
  const location = coords ? ` near ${coords.lat},${coords.lng}` : ' near me';
  return suggestion?.shop_url || `https://www.google.com/search?q=${encodeURIComponent(`${suggestion?.item || 'furniture'} store${location}`)}`;
};

const buildRouteUrl = (suggestion, coords) => {
  const origin = coords ? `&origin=${coords.lat},${coords.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(`${suggestion?.item || 'furniture'} store near me`)}`;
};

const buildRoutePreview = (place, coords, fallbackSuggestion) => {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (coords) {
      return {
        title: `${fallbackSuggestion?.item || 'Store'} near you`,
        origin: coords,
        destination: null,
        embedUrl: `https://www.openstreetmap.org/export/embed.html?marker=${coords.lat},${coords.lng}&bbox=${coords.lng - 0.03},${coords.lat - 0.03},${coords.lng + 0.03},${coords.lat + 0.03}`,
        routeUrl: buildRouteUrl(fallbackSuggestion, coords),
        needsStore: true,
      };
    }
    return {
      title: fallbackSuggestion?.item || 'Store route',
      origin: coords || null,
      destination: null,
      embedUrl: '',
      routeUrl: place?.routeUrl || buildRouteUrl(fallbackSuggestion, coords),
      needsStore: true,
    };
  }

  return {
    title: place?.name || fallbackSuggestion?.item || 'Store route',
    origin: coords || null,
    destination: { lat, lng },
    embedUrl: `https://www.openstreetmap.org/export/embed.html?marker=${lat},${lng}&bbox=${lng - 0.02},${lat - 0.02},${lng + 0.02},${lat + 0.02}`,
    routeUrl:
      place?.routeUrl ||
      (coords
        ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${coords.lat}%2C${coords.lng}%3B${lat}%2C${lng}`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`),
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
  if (routePreview?.needsStore) {
    return (
      <div style={{ padding: 24, border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        No store location was found for this suggestion yet. Open store search first, then choose a listed store to preview the route.
      </div>
    );
  }

  if (!center) {
    return (
      <div style={{ padding: 24, border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text-muted)' }}>
        Route preview needs location permission and a store result.
      </div>
    );
  }

  return (
    <div>
      {routeInfo && <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{routeInfo}</p>}
      <div style={{ height: 380, border: '1px solid var(--glass-border)', borderRadius: 12, overflow: 'hidden' }}>
        <MapContainer center={[center.lat, center.lng]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {origin && (
            <CircleMarker center={[origin.lat, origin.lng]} radius={8} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.9 }}>
              <Popup>Your location</Popup>
            </CircleMarker>
          )}
          {destination && (
            <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.9 }}>
              <Popup>{routePreview.title}</Popup>
            </CircleMarker>
          )}
          {routeLine.length > 0 && <Polyline positions={routeLine} pathOptions={{ color: '#7c3aed', weight: 5, opacity: 0.85 }} />}
        </MapContainer>
      </div>
    </div>
  );
}

const buildRecreatedSceneUrl = (result) => {
  const suggestions = (result?.suggestions || [])
    .slice(0, 8)
    .map((item) => `${item.item} placed at ${item.placementLabel || item.targetSurface || 'the best visible area'}`)
    .join(', ');
  const prompt = [
    'realistic interior design render of the analyzed room',
    result?.analysis_summary || result?.explanation || '',
    suggestions ? `add these suggested items: ${suggestions}` : '',
    'preserve room proportions, camera angle, windows, walls, floor, and lighting',
  ].filter(Boolean).join('. ');

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true&enhance=true`;
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
      result.recreatedImageUrl = result.local_recreated_scene || buildRecreatedSceneUrl(result);
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
  const [placesStatus, setPlacesStatus] = useState('');
  const [routePreview, setRoutePreview] = useState(null);
  const [storePreview, setStorePreview] = useState(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(Number(scanResult?.geometry?.aspectRatio) || 16 / 9);
  const visibleSuggestions = scanResult?.suggestions || [];

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
      }),
      () => setCoords(null),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    if (!selectedShop || !coords) {
      setNearbyPlaces([]);
      setPlacesStatus('');
      return;
    }

    const controller = new AbortController();

    const loadPlaces = async () => {
      setPlacesStatus('Finding nearby stores...');
      setNearbyPlaces([]);

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
        setPlacesStatus(data.places?.length ? data.notice || '' : data.notice || 'No nearby stores found. Try the search link.');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setPlacesStatus(error.message || 'Nearby store lookup is unavailable. Use the search link below.');
        }
      }
    };

    loadPlaces();
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
          <div style={{ display: 'grid', gridTemplateColumns: selectedShop ? 'minmax(0, 1fr) 320px' : '1fr', gap: 12, minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: showAll ? 240 : 100 }}>
              {(showAll ? scanResult.suggestions : scanResult.suggestions.slice(0, 3)).map((s, i) => (
                <SuggestionRow key={`${s.item}-${i}`} s={s} index={i} onShop={() => setSelectedShop(s)} />
              ))}
            </div>
            {selectedShop && (
              <aside style={{ border: '1px solid var(--glass-border)', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                <button type="button" onClick={() => setSelectedShop(null)} style={{ float: 'right', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>x</button>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.84rem' }}>{selectedShop.item}</h4>
                <p style={{ margin: '0 0 10px', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {coords ? 'Nearby stores ranked by distance.' : 'Allow location to show real nearby stores.'}
                </p>
                {placesStatus && (
                  <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{placesStatus}</p>
                )}
                {nearbyPlaces.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 110, overflowY: 'auto', marginBottom: 10 }}>
                    {nearbyPlaces.map((place) => (
                      <div key={place.placeId || place.name} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: 7 }}>
                        <strong style={{ display: 'block', fontSize: '0.74rem' }}>{place.name}</strong>
                        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {place.distanceKm !== null ? `${place.distanceKm} km | ` : ''}
                          {place.rating ? `${place.rating} stars | ` : ''}
                          {place.openNow === true ? 'Open now' : place.openNow === false ? 'Closed now' : 'Hours unknown'}
                        </span>
                        <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                          <a href={place.mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.68rem' }}>View</a>
                          <button
                            type="button"
                            onClick={() => setRoutePreview(buildRoutePreview(place, coords, selectedShop))}
                            style={{ color: 'var(--accent)', fontSize: '0.68rem', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                          >
                            Route
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setStorePreview({
                      title: `${selectedShop.item} store search`,
                      url: buildStoreSearchUrl(selectedShop, coords),
                      places: nearbyPlaces,
                      status: placesStatus,
                    })}
                    className="ghost-btn"
                    style={{ fontSize: '0.72rem' }}
                  >
                    Open store search
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nearbyPlaces[0]) {
                        setRoutePreview(buildRoutePreview(nearbyPlaces[0], coords, selectedShop));
                      } else {
                        setStorePreview({
                          title: `${selectedShop.item} store search`,
                          url: buildStoreSearchUrl(selectedShop, coords),
                          places: nearbyPlaces,
                          status: placesStatus || 'Choose a store first so DreamDwell can draw a route.',
                        });
                      }
                    }}
                    className="ghost-btn"
                    style={{ fontSize: '0.72rem' }}
                  >
                    Route
                  </button>
                </div>
              </aside>
            )}
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
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{storePreview.title}</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Search preview</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setStorePreview(null)}>Close</button>
            </div>
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: 12, padding: 14, minHeight: 260, background: 'rgba(255,255,255,0.04)' }}>
              {storePreview.places?.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {storePreview.places.map((place) => (
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
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {storePreview.status || 'No in-app store results are available. You can still open the full search.'}
                </p>
              )}
            </div>
            <a href={storePreview.url} target="_blank" rel="noreferrer" className="ghost-btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Open full search
            </a>
          </section>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ s, index = 0, onShop }) {
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
