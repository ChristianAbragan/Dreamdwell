import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PhotoGrid from '../../components/PhotoGrid';
import PhotoModal from '../../components/PhotoModal';
import styles from '../../styles/Photos.module.css';
import { API_BASE_URL } from '../../config/api';
import { inferDesignIntent, readLastScan, readRecentContext } from '../../utils/dreamdwellContext';

const buildInspirationContext = (userId) => {
  try {
    const profile = JSON.parse(localStorage.getItem('dreamdwellProfile') || '{}');
    const recentContext = readRecentContext(userId);
    const lastScan = readLastScan({}, userId);

    const recentText = Array.isArray(recentContext)
      ? recentContext.map((entry) => entry.text).join(' | ')
      : '';
    const inferredIntent = inferDesignIntent(recentText);
    const contextParts = [
      profile.architecturalStyle,
      profile.favoriteRoom,
      profile.moodPreference,
      profile.palettePreference,
      profile.materialPreference,
      lastScan.explanation,
      lastScan.audit,
      ...(Array.isArray(recentContext) ? recentContext.map((entry) => entry.text) : []),
    ].filter(Boolean);

    return {
      style: profile.architecturalStyle || localStorage.getItem('architecturalDNA') || 'modern',
      room: inferredIntent?.room || profile.favoriteRoom || lastScan.favoriteRoom || '',
      mood: profile.moodPreference || lastScan.moodPreference || '',
      query: inferredIntent?.query || '',
      context: contextParts.join(' | ').slice(0, 1200),
    };
  } catch (_error) {
    return {
      style: localStorage.getItem('architecturalDNA') || 'modern',
      room: '',
      mood: '',
      query: '',
      context: '',
    };
  }
};

const Photos = () => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [saved, setSaved] = useState(new Set());
  const savedCount = saved.size;
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [inspirationSeed, setInspirationSeed] = useState(() => buildInspirationContext(user?.uid));
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef(null);

  useEffect(() => {
    setInspirationSeed(buildInspirationContext(user?.uid));
  }, [user?.uid]);

  const fetchSavedPhotos = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/photos/saved?userId=${encodeURIComponent(user.uid)}`, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load saved photos');

      const data = await response.json();
      setSaved(new Set((data.photos || []).map((photo) => photo.photoId || photo.id)));
    } catch (err) {
      console.error('Error fetching saved photos:', err);
    }
  }, [user]);

  const fetchPhotos = useCallback(async (reset = false, pageOverride, explicitQuery = null) => {
    try {
      setLoading(true);
      setError(null);

      const currentSeed = buildInspirationContext(user?.uid);
      setInspirationSeed(currentSeed);
      const requestPage = reset ? 1 : pageOverride ?? 1;
      const activeQuery = explicitQuery !== null ? explicitQuery : submittedQuery;
      const params = new URLSearchParams({
        style: currentSeed.style,
        room: currentSeed.room,
        mood: currentSeed.mood,
        context: currentSeed.context,
        query: activeQuery || currentSeed.query,
        limit: '30',
        page: String(requestPage),
        userId: user?.uid || '',
      });

      const response = await fetch(`${API_BASE_URL}/api/photos?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load photos');

      const data = await response.json();
      if (reset) {
        setPhotos(data.photos || []);
      } else {
        setPhotos((prev) => [...prev, ...(data.photos || [])]);
      }
      setHasMore((data.photos || []).length >= 24);
    } catch (err) {
      console.error('Error fetching photos:', err);
      setError('Failed to load inspiration photos. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [submittedQuery, user?.accessToken, user?.uid]);

  const handleSearchSubmit = useCallback((event) => {
    event?.preventDefault();
    const nextQuery = searchQuery.trim();
    setPhotos([]);
    setHasMore(true);
    setSubmittedQuery(nextQuery);
    setPage(1);
    fetchPhotos(true, 1, nextQuery);
  }, [fetchPhotos, searchQuery]);

  // Initial load only; do not refetch on every searchQuery keystroke
  useEffect(() => {
    if (page > 1) fetchPhotos(false, page);
  }, [page, fetchPhotos]);

  useEffect(() => {
    fetchPhotos(true, 1);
  }, [submittedQuery, fetchPhotos]);

  useEffect(() => {
    fetchSavedPhotos();
  }, [fetchSavedPhotos]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loading) return;
    const currentTarget = loaderRef.current;
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 1 }
    );
    if (currentTarget) observer.observe(currentTarget);
    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
  }, [hasMore, loading]);

  const handleSavePhoto = async (photo) => {
    const previousSaved = new Set(saved);
    const nextSaved = new Set(saved);
    if (nextSaved.has(photo.id)) {
      nextSaved.delete(photo.id);
    } else {
      nextSaved.add(photo.id);
    }
    setSaved(nextSaved);

    try {
      await fetch(`${API_BASE_URL}/api/photos/${photo.id}/save`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saved: nextSaved.has(photo.id),
          userId: user?.uid,
          photo,
        }),
      });
    } catch (err) {
      console.error('Error saving photo:', err);
      setSaved(previousSaved);
    }
  };

  if (loading && photos.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading your inspiration signal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerBar}>
        <div className={styles.titleBlock}>
          <p className={styles.kicker}>Inspiration</p>
          <h1>Design Board</h1>
          <p>{savedCount} saved ideas / {photos.length} loaded</p>
        </div>

        <form className={styles.searchPanel} onSubmit={handleSearchSubmit}>
          <input
            id="inspiration-search"
            type="text"
            aria-label="Search inspiration"
            placeholder="Search styles, rooms, materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit">{searchQuery.trim() ? 'Search' : 'Refresh'}</button>
        </form>
      </div>

      <div className={styles.chips}>
        {[
          inspirationSeed.style,
          inspirationSeed.room,
          inspirationSeed.mood,
          inspirationSeed.query,
          submittedQuery ? `Search: ${submittedQuery}` : 'AI-guided feed',
        ]
          .filter(Boolean)
          .map((chip) => (
            <span key={chip} className={styles.chips}>
              {chip}
            </span>
          ))}
      </div>

      {error ? (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button onClick={() => fetchPhotos(true)} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      ) : photos.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No photos matched yet. Try another search or run a new room analysis.</p>
        </div>
      ) : (
        <>
          <PhotoGrid
            photos={photos}
            onPhotoClick={setSelectedPhoto}
            onSave={handleSavePhoto}
            saved={saved}
          />
          {hasMore && (
            <div ref={loaderRef} className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Loading more inspiration...</p>
            </div>
          )}
        </>
      )}

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onSave={() => handleSavePhoto(selectedPhoto)}
          isSaved={saved.has(selectedPhoto.id)}
        />
      )}
    </div>
  );
};

export default Photos;

