import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const parseArchivePayload = (log) => {
  if (log.goal !== 'INSPIRATION_SAVE') return null;

  try {
    return JSON.parse(log.suggestions);
  } catch (_error) {
    return null;
  }
};

const parseAnalysisPayload = (log) => {
  try {
    const parsed = JSON.parse(log.suggestions || '{}');
    return Array.isArray(parsed) ? { suggestions: parsed } : parsed;
  } catch (_error) {
    return { suggestions: [] };
  }
};

const buildImageSrc = (imageUrl) => {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  return imageUrl;
};

const buildRecreatedSceneUrl = (log) => {
  const payload = parseAnalysisPayload(log);
  const suggestions = (payload.suggestions || [])
    .slice(0, 8)
    .map((item) => `${item.item} at ${item.placementLabel || item.targetSurface || 'a suitable area'}`)
    .join(', ');
  const prompt = [
    'realistic interior design render of the same analyzed room',
    payload.analysis_summary || log.summary || '',
    suggestions ? `add these design suggestions: ${suggestions}` : '',
    'keep the room architecture, camera angle, windows, floor, and wall proportions consistent',
  ].filter(Boolean).join('. ');

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true&enhance=true`;
};

const getArchiveSceneImage = (log) => {
  const payload = parseAnalysisPayload(log);
  if (payload.local_recreated_scene) {
    return payload.local_recreated_scene;
  }
  if (payload.generated_scene_url) {
    return payload.generated_scene_url;
  }
  if (payload.render_provider && log.imageUrl && !log.imageUrl.startsWith('data:image/')) {
    return log.imageUrl;
  }
  return buildRecreatedSceneUrl(log);
};

const isOriginalScanImage = (log, imageUrl) => {
  if (!imageUrl) return false;
  const payload = parseAnalysisPayload(log);
  return imageUrl === log.imageUrl || imageUrl === payload.fallback_image_url || imageUrl.startsWith('data:image/');
};

export default function Vault({ user }) {
  const authContext = useAuth();
  const activeUser = authContext.user || user;
  const { refreshToken } = authContext;
  const [logs, setLogs] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeUser?.uid) return;

    let ignore = false;

    const loadVault = async () => {
      setLoading(true);
      setError('');

      try {
        const fetchWithToken = (token) =>
          fetch(`${API_BASE_URL}/api/sessions/${activeUser.uid}`, {
            headers: {
              Authorization: `Bearer ${token || ''}`,
            },
          });

        let response = await fetchWithToken(activeUser.accessToken);
        if (response.status === 401 && refreshToken) {
          const freshToken = await refreshToken();
          response = await fetchWithToken(freshToken);
        }

        if (!response.ok) {
          throw new Error(`Archive request failed (${response.status})`);
        }

        const data = await response.json();
        if (!ignore) setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Vault index failed:', err);
        if (!ignore) {
          setLogs([]);
          setError('Archive could not load. Please sign in again or try after the backend is running.');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadVault();

    return () => {
      ignore = true;
    };
  }, [activeUser, refreshToken]);

  const { inspirationSaves, analysisSessions } = useMemo(() => {
    const saves = [];
    const sessions = [];

    logs.forEach((log) => {
      const archivePhoto = parseArchivePayload(log);
      if (archivePhoto) {
        saves.push({ ...log, archivePhoto });
      } else {
        sessions.push(log);
      }
    });

    return {
      inspirationSaves: saves,
      analysisSessions: sessions,
    };
  }, [logs]);

  if (loading) {
    return (
      <div style={{ color: 'var(--accent)' }} className="mono">
        CONNECTING TO DATABANKS...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '2rem', marginBottom: '8px' }}>Archive</h1>
        <p style={{ opacity: 0.62, margin: 0 }}>
          Saved inspiration and past room analyses live together here.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="glass-panel" style={{ padding: '24px', opacity: 0.78 }}>
          {error || 'No saved inspiration or room analyses yet. Save an inspiration image or run a scan to archive it here.'}
        </div>
      ) : (
        <>
          <section style={{ marginBottom: '34px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Saved Inspiration</h2>
              <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                {inspirationSaves.length} saved looks
              </span>
            </div>

            {inspirationSaves.length === 0 ? (
              <div className="glass-panel" style={{ padding: '22px', opacity: 0.7 }}>
                Save ideas from Inspiration and they will appear here.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                }}
              >
                {inspirationSaves.map((log) => (
                  <article
                    key={log.id}
                    className="glass-panel"
                    style={{
                      overflow: 'hidden',
                      border: '1px solid var(--glass-border)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <img
                      src={log.archivePhoto.imageUrl}
                      alt={log.archivePhoto.title}
                      style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ padding: '16px' }}>
                      <p style={{ margin: '0 0 6px', fontSize: '0.74rem', color: 'var(--accent)' }}>
                        {log.archivePhoto.style}
                      </p>
                      <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>{log.archivePhoto.title}</h3>
                      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', opacity: 0.72, lineHeight: 1.5 }}>
                        {log.summary}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', opacity: 0.55 }}>{log.date}</span>
                        <a
                          href={log.archivePhoto.shopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.72rem', color: 'var(--accent)' }}
                        >
                          Shop
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Analysis Sessions</h2>
              <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                {analysisSessions.length} room scans
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: selectedSession ? 'minmax(0, 1fr) minmax(320px, 0.75fr)' : '1fr',
                gap: '18px',
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {analysisSessions.map((log) => (
                <div
                  key={log.id}
                  className="glass-panel"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '18px',
                    padding: '20px 24px',
                    background: 'rgba(255,255,255,0.02)',
                    border: 'none',
                    borderLeft: '4px solid var(--accent)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.72rem', opacity: 0.46 }}>{log.date}</span>
                    <h4 style={{ margin: '8px 0', fontSize: '1rem' }}>{log.goal.toUpperCase()}</h4>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: '0.78rem',
                        opacity: 0.82,
                        maxWidth: '640px',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {log.summary}
                    </p>
                    {log.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setSelectedSession(log)}
                        className="mono"
                        style={{
                          display: 'inline-block',
                          marginTop: '10px',
                          fontSize: '0.7rem',
                          color: 'var(--accent)',
                          background: 'transparent',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        [ VIEW_RECREATED_SCENE ]
                      </button>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>{log.style}</span>
                  </div>
                </div>
              ))}
              </div>
              {selectedSession && (
                <aside
                  className="glass-panel"
                  style={{
                    padding: '16px',
                    position: 'sticky',
                    top: 0,
                    maxHeight: 'calc(100vh - 180px)',
                    overflowY: 'auto',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSession(null)}
                    style={{
                      float: 'right',
                      background: 'transparent',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      padding: '5px 9px',
                    }}
                  >
                    Close
                  </button>
                  <h3 style={{ margin: '0 0 12px', color: 'var(--accent)' }}>Recreated Scene</h3>
                  <img
                    src={buildImageSrc(getArchiveSceneImage(selectedSession))}
                    alt="Recreated room scene"
                    loading="lazy"
                    onError={(event) => {
                      if (!event.currentTarget.dataset.retried) {
                        event.currentTarget.dataset.retried = 'true';
                        const retryUrl = getArchiveSceneImage(selectedSession);
                        event.currentTarget.src = `${buildImageSrc(retryUrl)}${retryUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`;
                        return;
                      }
                      console.warn('Archive scene image failed to load', {
                        imageUrl: selectedSession.imageUrl?.slice?.(0, 120),
                      });
                      event.currentTarget.src =
                        'https://placehold.co/900x900/111827/e5e7eb?text=Render+still+generating';
                    }}
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      display: 'block',
                      marginBottom: '14px',
                      background: 'var(--surface)',
                    }}
                  />
                  {(() => {
                    const payload = parseAnalysisPayload(selectedSession);
                    const added = Array.isArray(payload.added_elements)
                      ? payload.added_elements
                      : `${payload.added_elements || ''}`.split(',').filter(Boolean);
                    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];

                    return (
                      <>
                        {payload.analysis_summary && (
                          <>
                            <h4 style={{ margin: '12px 0 6px', fontSize: '0.78rem' }}>What was analyzed</h4>
                            <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, opacity: 0.76 }}>
                              {payload.analysis_summary}
                            </p>
                          </>
                        )}
                        {isOriginalScanImage(selectedSession, selectedSession.imageUrl) && (
                          <p style={{ margin: '10px 0 0', fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                            DreamDwell is showing a generated recreated render above. The original scan is kept only as fallback data and is not used as the recreated scene.
                          </p>
                        )}
                        {(payload.render_provider || payload.render_warning) && (
                          <p
                            style={{
                              margin: '10px 0 0',
                              fontSize: '0.72rem',
                              lineHeight: 1.45,
                              color: payload.edit_applied === false ? '#9a6a16' : 'var(--text-muted)',
                            }}
                          >
                            Render source: {payload.render_provider || 'unknown'}
                            {payload.edit_applied === false
                              ? '. Free Pollinations image editing was unavailable, so this saved scene shows the original analyzed image instead of an unrelated generated room.'
                              : ''}
                            {payload.render_warning ? ` ${payload.render_warning}` : ''}
                          </p>
                        )}
                        {added.length > 0 && (
                          <>
                            <h4 style={{ margin: '14px 0 8px', fontSize: '0.78rem' }}>Added or changed</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {added.map((item) => (
                                <span
                                  key={item}
                                  style={{
                                    padding: '6px 9px',
                                    borderRadius: 999,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--glass-border)',
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                        {suggestions.length > 0 && (
                          <>
                            <h4 style={{ margin: '14px 0 8px', fontSize: '0.78rem' }}>Placement details</h4>
                            {suggestions.slice(0, 8).map((item, index) => (
                              <p key={`${item.item}-${index}`} style={{ margin: '0 0 8px', fontSize: '0.74rem', lineHeight: 1.5 }}>
                                <strong>{item.item}</strong>: {item.reason}
                              </p>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </aside>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

