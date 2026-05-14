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

const compactPrompt = (value = '', maxLength = 1200) =>
  String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);

const buildPollinationsImageUrl = (promptText = '') =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(compactPrompt(promptText))}?width=1024&height=1024&nologo=true&seed=42`;

const proxyImageUrl = (imageUrl) => {
  if (!imageUrl || imageUrl.startsWith('data:image/')) return imageUrl;
  if (!imageUrl.startsWith('https://image.pollinations.ai/')) return imageUrl;
  return `${API_BASE_URL}/api/public/image-proxy?url=${encodeURIComponent(imageUrl)}`;
};

const buildRecreatedSceneUrl = (log) => {
  const payload = parseAnalysisPayload(log);
  if (payload.source_recreation_prompt) {
    return buildPollinationsImageUrl(payload.source_recreation_prompt);
  }

  const baseScene = payload.analysis_summary || log.summary || 'an empty room';
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];

  const suggestionItems = suggestions
    .slice(0, 8)
    .map((item) => {
      const placement = item.placementLabel || item.targetSurface || 'the room';
      return `${item.item} anchored at ${placement}`;
    })
    .join(', ');

  const promptText = suggestionItems
    ? `A high-resolution architectural photograph of a room visually similar to the analyzed space, ${baseScene}, ${suggestionItems}, cohesive interior design synthesis, matching perspective and room proportions, realistic depth and occlusion, material and texture fidelity with matte wood, woven textiles, brushed metal, reflective glass, ceramic surfaces, unified natural lighting wrapping around existing and new objects, realistic contact shadows, style-consistent decor, architectural photography, soft diffused natural light, 8k resolution, photorealistic, shot on 35mm lens`
    : `A high-resolution architectural photograph of a room visually similar to the analyzed space, ${baseScene}, matching perspective and room proportions, realistic depth, material and texture fidelity, unified natural lighting, architectural photography, soft diffused natural light, 8k resolution, photorealistic, shot on 35mm lens`;

  console.log('Generated Pollinations prompt:', promptText);
  return buildPollinationsImageUrl(promptText);
};

const getArchiveSceneImage = (log) => {
  return proxyImageUrl(buildRecreatedSceneUrl(log));
};

const getArchiveSceneFallbacks = (log) => {
  const payload = parseAnalysisPayload(log);
  const rebuilt = buildRecreatedSceneUrl(log);
  return [
    rebuilt,
    payload.generated_scene_url && proxyImageUrl(payload.generated_scene_url),
    payload.generated_scene_url,
    payload.local_recreated_scene,
    'https://placehold.co/900x900/111827/e5e7eb?text=Render+still+generating',
  ].filter(Boolean);
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
  const [selectedArchiveIds, setSelectedArchiveIds] = useState(new Set());
  const [manageMode, setManageMode] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState('');
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

  const getAuthToken = async () => {
    if (authContext.refreshToken) return authContext.refreshToken();
    return activeUser?.getIdToken ? activeUser.getIdToken() : activeUser?.accessToken;
  };

  const toggleArchiveSelection = (id) => {
    setSelectedArchiveIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteArchiveItems = async (items, label = 'selected items') => {
    const targets = items.filter(Boolean);
    if (!targets.length) return;
    if (!window.confirm(`Delete ${label} from your archive? This cannot be undone.`)) return;

    setArchiveNotice('Deleting archive items...');
    try {
      const token = await getAuthToken();
      const deletedIds = [];
      await Promise.all(targets.map(async (item) => {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${item.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token || ''}` },
        });

        if (response.ok) {
          deletedIds.push(item.id);
          return response.json();
        }

        if (item.goal === 'INSPIRATION_SAVE' && item.archivePhoto?.photoId) {
          const fallback = await fetch(`${API_BASE_URL}/api/photos/${item.archivePhoto.photoId}/save`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token || ''}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ saved: false, userId: activeUser.uid, photo: item.archivePhoto }),
          });
          if (fallback.ok) {
            deletedIds.push(item.id);
            return fallback.json();
          }
        }

        throw new Error(`Delete failed (${response.status})`);
      }));

      setLogs((current) => current.filter((log) => !deletedIds.includes(log.id)));
      setSelectedArchiveIds(new Set());
      if (selectedSession && deletedIds.includes(selectedSession.id)) setSelectedSession(null);
      setArchiveNotice(`Deleted ${deletedIds.length} archive item${deletedIds.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Archive delete failed:', err);
      setArchiveNotice('Could not delete archive items. Restart the backend if it is still running old routes, then try again.');
    }
  };

  const deleteSelectedArchiveItems = () => {
    const targets = logs.filter((log) => selectedArchiveIds.has(log.id)).map((log) => {
      const archivePhoto = parseArchivePayload(log);
      return archivePhoto ? { ...log, archivePhoto } : log;
    });
    deleteArchiveItems(targets, `${targets.length} selected item${targets.length === 1 ? '' : 's'}`);
  };

  const clearArchiveType = async (type) => {
    const labels = {
      inspiration: 'all saved inspiration',
      analysis: 'all room scans',
      all: 'your entire archive',
    };
    if (!window.confirm(`Clear ${labels[type]}? This cannot be undone.`)) return;

    setArchiveNotice('Clearing archive...');
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/sessions/user/${activeUser.uid}/clear?type=${type}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) throw new Error(`Clear failed (${response.status})`);
      const result = await response.json();
      setLogs((current) => {
        if (type === 'all') return [];
        return current.filter((log) => (type === 'inspiration' ? log.goal !== 'INSPIRATION_SAVE' : log.goal === 'INSPIRATION_SAVE'));
      });
      setSelectedArchiveIds(new Set());
      setSelectedSession(null);
      setArchiveNotice(`Cleared ${result.count || 0} archive item${result.count === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Archive clear failed:', err);
      setArchiveNotice('Could not clear archive. Check the backend and try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ color: 'var(--accent)' }} className="mono">
        CONNECTING TO DATABANKS...
      </div>
    );
  }

  return (
    <div style={{ width: 'min(100%, 1320px)', margin: '0 auto', padding: '4px clamp(4px, 1.4vw, 18px) 24px' }}>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-end' }}>
        <div>
        <h1 style={{ color: 'var(--accent)', fontSize: '2rem', marginBottom: '8px' }}>Archive</h1>
        <p style={{ opacity: 0.62, margin: 0 }}>
          Saved inspiration and past room analyses live together here.
        </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ padding: '8px 11px', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
            {inspirationSaves.length} saved looks
          </span>
          <span style={{ padding: '8px 11px', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
            {analysisSessions.length} room scans
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setManageMode((current) => !current);
            setSelectedArchiveIds(new Set());
          }}
          style={{ border: '1px solid var(--glass-border)', padding: '8px 12px' }}
        >
          {manageMode ? 'Done managing' : 'Manage archive'}
        </button>
        {manageMode && (
          <>
            <button type="button" className="ghost-btn" onClick={deleteSelectedArchiveItems} disabled={selectedArchiveIds.size === 0}>
              Delete selected ({selectedArchiveIds.size})
            </button>
            <button type="button" className="ghost-btn" onClick={() => clearArchiveType('inspiration')} disabled={inspirationSaves.length === 0}>
              Clear saved looks
            </button>
            <button type="button" className="ghost-btn" onClick={() => clearArchiveType('analysis')} disabled={analysisSessions.length === 0}>
              Clear room scans
            </button>
            <button type="button" className="ghost-btn" onClick={() => clearArchiveType('all')} disabled={logs.length === 0}>
              Clear all
            </button>
          </>
        )}
        {archiveNotice && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{archiveNotice}</span>}
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
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
                    {manageMode && (
                      <label style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: '6px 8px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--glass-border)', fontSize: '0.72rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={selectedArchiveIds.has(log.id)} onChange={() => toggleArchiveSelection(log.id)} />
                        Select
                      </label>
                    )}
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
                        {manageMode && (
                          <button type="button" onClick={() => deleteArchiveItems([log], 'this saved look')} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>
                            Delete
                          </button>
                        )}
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
                  {manageMode && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={selectedArchiveIds.has(log.id)} onChange={() => toggleArchiveSelection(log.id)} />
                      Select
                    </label>
                  )}
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
                    {manageMode && (
                      <button
                        type="button"
                        onClick={() => deleteArchiveItems([log], 'this room scan')}
                        style={{
                          display: 'inline-block',
                          marginTop: '10px',
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          color: 'var(--danger)',
                          background: 'transparent',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        DELETE
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
                  {(() => {
                    const payload = parseAnalysisPayload(selectedSession);
                    const added = Array.isArray(payload.added_elements)
                      ? payload.added_elements
                      : `${payload.added_elements || ''}`.split(',').filter(Boolean);
                    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];

                    return (
                      <>
                        <img
                          key={selectedSession.id}
                          src={buildImageSrc(getArchiveSceneImage(selectedSession))}
                          alt="AI recreated room scene with suggestions"
                          onError={(event) => {
                            const fallbacks = getArchiveSceneFallbacks(selectedSession);
                            const nextIndex = Number(event.currentTarget.dataset.fallbackIndex || 0);
                            const nextUrl = fallbacks[nextIndex];

                            if (nextUrl) {
                              event.currentTarget.dataset.fallbackIndex = String(nextIndex + 1);
                              event.currentTarget.src = buildImageSrc(nextUrl);
                              return;
                            }
                            console.warn('Archive scene image failed to load', {
                              imageUrl: selectedSession.imageUrl?.slice?.(0, 120),
                            });
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
                            DreamDwell is showing an AI recreated render based on the saved analysis prompt. It keeps only a visual glimpse of the original room rather than an exact replica.
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

