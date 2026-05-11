import { PrismaClient } from '@prisma/client';
import { PHOTO_DATABASE } from './photoDatabase.js';

const prisma = new PrismaClient();

const tokenize = (value) =>
  `${value || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const unique = (items) => [...new Set(items.filter(Boolean))];

const hashString = (value) =>
  `${value}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

const titleCase = (value = '') =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const pickFrom = (items, seed, fallback = '') => items[Math.abs(seed) % items.length] || fallback;

const withImageSignature = (url = '', signature = '') => {
  if (!url) return '';
  return url;
};

// ── Live Unsplash search ──────────────────────────────────────────────

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_BASE = 'https://api.unsplash.com';

async function searchUnsplash({ query, style, room, mood, page = 1, perPage = 30 }) {
  if (!UNSPLASH_ACCESS_KEY) {
    console.log('[Unsplash] No API key configured — skipping live search');
    return [];
  }

  const searchParts = [style, room, mood, query].filter(Boolean);
  const searchQuery = searchParts.length > 0
    ? searchParts.join(' ')
    : 'interior design living room';

  try {
    const params = new URLSearchParams({
      query: searchQuery,
      page: String(page),
      per_page: String(perPage),
      orientation: 'landscape',
    });

    const res = await fetch(`${UNSPLASH_BASE}/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1',
      },
    });

    if (!res.ok) {
      console.error(`[Unsplash] Search failed ${res.status}:`, await res.text());
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((photo) => {
      const aspectH = Math.round((photo.height / photo.width) * 300);
      return {
        id: `unsplash-${photo.id}`,
        title: photo.alt_description || 'Interior Inspiration',
        style: '',
        room: '',
        mood: '',
        palette: [photo.color || '#f7f3ed', '#c9c2b8', '#5f625c'],
        colors: [photo.color || '#f7f3ed', '#c9c2b8', '#5f625c'],
        materials: [],
        tags: (photo.tags || []).map((t) => t.title).filter(Boolean),
        imageUrl: photo.urls.regular || photo.urls.small,
        description: photo.description || '',
        shopUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchQuery)}`,
        height: Math.max(200, aspectH),
        score: 0,
        matchReason: 'Live from Unsplash',
        source: 'unsplash',
        unsplashUrl: photo.links.html,
      };
    });
  } catch (err) {
    console.error('[Unsplash] Error:', err.message);
    return [];
  }
}

async function buildUserContext(userId) {
  if (!userId || userId === 'anonymous') return [];

  try {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return unique(
      sessions.flatMap((session) =>
        tokenize(`${session.style} ${session.goal} ${session.summary} ${session.suggestions}`)
      )
    );
  } catch (error) {
    console.error('Error building user context:', error);
    return [];
  }
}

function scorePhoto(photo, desired) {
  const styleTokens = tokenize(photo.style);
  const roomTokens = tokenize(photo.room);
  const tagTokens = tokenize(`${photo.tags.join(' ')} ${photo.description} ${photo.mood}`);
  const desiredTokens = unique(desired);

  let score = 0;
  let matchCount = 0;

  desiredTokens.forEach((token) => {
    if (styleTokens.includes(token)) {
      score += 12;
      matchCount++;
    }
    if (roomTokens.includes(token)) {
      score += 10;
      matchCount++;
    }
    if (tagTokens.includes(token)) {
      score += 4;
      matchCount++;
    }
    if (photo.palette.join(' ').toLowerCase().includes(token)) {
      score += 2;
      matchCount++;
    }
  });

  // Boost for exact matches
  if (desiredTokens.includes(photo.style.toLowerCase())) score += 20;
  if (desiredTokens.includes(photo.room.toLowerCase())) score += 18;

  // Boost for multiple matches
  if (matchCount >= 3) score += 15;
  if (matchCount >= 5) score += 10;

  // Add some randomization to prevent identical scores
  score += hashString(photo.id) % 8;

  return score;
}

function buildReason(photo, desiredTokens) {
  const matched = desiredTokens.filter((token) =>
    tokenize(`${photo.style} ${photo.room} ${photo.mood} ${photo.tags.join(' ')}`).includes(token)
  );

  if (matched.length === 0) {
    return `Picked to broaden your inspiration feed with ${photo.style.toLowerCase()} ideas.`;
  }

  return `Matched to your recent interest in ${matched.slice(0, 3).join(', ')}.`;
}

const pickPhotoForTerms = (tokens, seed) => {
  const scored = PHOTO_DATABASE.map((photo) => ({
    photo,
    score: scorePhoto(photo, tokens) + (hashString(`${photo.id}-${seed}`) % 10),
  })).sort((a, b) => b.score - a.score);

  return scored[Math.abs(seed) % Math.min(scored.length, 18)]?.photo || PHOTO_DATABASE[0];
};

function buildLiveSearchPhotos({ query, room, style, mood, page, limit }) {
  const text = `${query} ${room} ${style} ${mood}`.trim();
  const tokens = unique(tokenize(text));

  // ALWAYS return results now - remove the query check that blocked empty searches
  const seedBase = hashString(`${text || 'default'}-${page}`);
  const targetRoom = room || pickFrom(['living room', 'bedroom', 'kitchen', 'office', 'bathroom', 'dining room'], seedBase, 'room');
  const targetStyle = style || pickFrom(['modern', 'scandinavian', 'warm minimal', 'organic', 'contemporary'], seedBase + 7, 'modern');
  const targetMood = mood || pickFrom(['calm', 'cozy', 'bright', 'refined', 'warm', 'minimal'], seedBase + 13, 'curated');

  const count = Math.min(6, Math.max(1, Math.ceil((Number(limit) || 30) / 6)));

  return Array.from({ length: count }, (_, index) => {
    const seed = seedBase + index * 37 + index * index;
    const sourcePhoto = pickPhotoForTerms(
      unique([...tokens, ...tokenize(targetRoom), ...tokenize(targetStyle)]),
      seed
    );
    const roomLabel = room ? titleCase(room) : sourcePhoto.room || titleCase(targetRoom);
    const styleLabel = style ? titleCase(style) : sourcePhoto.style || titleCase(targetStyle);

    return {
      id: `live-${seed}-${index}`,
      title: sourcePhoto.title || `${styleLabel} ${roomLabel}`,
      style: styleLabel,
      room: roomLabel,
      mood: mood ? titleCase(mood) : sourcePhoto.mood || titleCase(targetMood),
      palette: sourcePhoto.palette || ['#f7f3ed', '#c9c2b8', '#5f625c'],
      colors: sourcePhoto.palette || ['#f7f3ed', '#c9c2b8', '#5f625c'],
      materials: sourcePhoto.materials || ['wood', 'textile', 'stone'],
      tags: unique([...tokens, ...(sourcePhoto.tags || [])]),
      imageUrl: withImageSignature(sourcePhoto.imageUrl, `${seed}-${index}`),
      description: query
        ? `A visual direction for "${query}" using ${styleLabel.toLowerCase()} ${roomLabel.toLowerCase()} cues.`
        : sourcePhoto.description || `Fresh ${styleLabel.toLowerCase()} ${roomLabel.toLowerCase()} inspiration for you.`,
      shopUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${query || targetStyle + ' ' + targetRoom} furniture decor`)}`,
      height: 420 + (Math.abs(seed) % 180),
      score: query ? 150 - index : 95 - index,
      matchReason: query ? `Search match: ${query}` : `Fresh ${styleLabel.toLowerCase()} ${roomLabel.toLowerCase()} direction.`,
    };
  });
}

function toArchivePayload(photo) {
  return {
    photoId: photo.id,
    title: photo.title,
    style: photo.style,
    room: photo.room,
    imageUrl: photo.imageUrl,
    description: photo.description,
    colors: photo.palette,
    shopUrl: photo.shopUrl,
    mood: photo.mood,
  };
}

async function getCuratedPhotos({
  style = 'modern',
  room = '',
  mood = '',
  query = '',
  context = '',
  limit = 30,
  page = 1,
  userId,
}) {
  try {
    const userContextTokens = await buildUserContext(userId);
    const desiredTokens = unique([
      ...tokenize(style),
      ...tokenize(room),
      ...tokenize(mood),
      ...tokenize(query),
      ...tokenize(context),
      ...userContextTokens,
    ]);

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(Math.max(1, Number(limit) || 30), 60);
    const startIndex = (pageNumber - 1) * pageSize;

    // Fetch live Unsplash photos — pass context so search is personalized
    const [livePhotos] = await Promise.all([
      searchUnsplash({ query, style, room, mood, page: pageNumber, perPage: pageSize }),
    ]);

    console.log(`[PhotoService] query="${query}" | livePhotos=${livePhotos.length} | DBphotos=${PHOTO_DATABASE.length}`);

    // Score curated database photos against the user's context tokens
    const scoredPhotos = PHOTO_DATABASE.map((photo) => ({
      ...photo,
      colors: photo.palette,
      imageUrl: withImageSignature(photo.imageUrl, `curated-${photo.id}`),
      score: scorePhoto(photo, desiredTokens),
      matchReason: buildReason(photo, desiredTokens),
    }));

    // Score live Unsplash photos — boosted on search so they always surface
    const scoredLive = livePhotos.map((photo) => {
      const liveTokens = unique(tokenize(`${style} ${room} ${mood} ${query}`));
      const matchCount = liveTokens.filter((t) =>
        tokenize(`${photo.title} ${photo.description} ${(photo.tags || []).join(' ')}`).includes(t)
      ).length;
      // On search: base 60 + bonus per match (ensures Unsplash dominates search results)
      // On home feed: low score so DB curated photos lead
      const hasQuery = query.trim().length > 0;
      const baseScore = hasQuery ? 60 + matchCount * 15 : matchCount * 8;
      return { ...photo, score: baseScore };
    });

    // On search: Unsplash first, DB fills remaining slots. On home feed: merge by score.
    const hasQuery = query.trim().length > 0;
    const rankedPhotos = hasQuery
      ? [...scoredLive, ...scoredPhotos]
      : [...scoredPhotos, ...scoredLive].sort((a, b) => b.score - a.score);

    const seenUrls = new Set();
    const deduplicated = rankedPhotos.filter((photo) => {
      if (seenUrls.has(photo.imageUrl)) return false;
      seenUrls.add(photo.imageUrl);
      return true;
    });

    const results = deduplicated.slice(startIndex, startIndex + pageSize);
    console.log(`[PhotoService] returning ${results.length} photos | first=${results[0]?.id} | firstSrc=${results[0]?.source || 'db'}`);
    return results;
  } catch (error) {
    console.error('Error in getCuratedPhotos:', error);
    return [];
  }
}

async function savePhoto({ userId, photoId, saved, photo }) {
  try {
    if (!userId || userId === 'anonymous') {
      throw new Error('Missing user id for inspiration save.');
    }

    const existing = await prisma.session.findFirst({
      where: {
        userId,
        goal: 'INSPIRATION_SAVE',
        suggestions: { contains: `"photoId":"${photoId}"` },
      },
    });

    if (saved) {
      if (!existing) {
        const sourcePhoto =
          photo || PHOTO_DATABASE.find((candidate) => candidate.id === photoId) || PHOTO_DATABASE[0];
        const archivePhoto = toArchivePayload(sourcePhoto);
        await prisma.session.create({
          data: {
            userId,
            summary: archivePhoto.description,
            suggestions: JSON.stringify(archivePhoto),
            imageUrl: archivePhoto.imageUrl,
            style: archivePhoto.style,
            goal: 'INSPIRATION_SAVE',
            date: new Date().toLocaleDateString(),
          },
        });
      }
    } else if (existing) {
      await prisma.session.delete({ where: { id: existing.id } });
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving photo:', error);
    throw error;
  }
}

async function getSavedPhotos(userId) {
  try {
    if (!userId || userId === 'anonymous') return [];

    const sessions = await prisma.session.findMany({
      where: {
        userId,
        goal: 'INSPIRATION_SAVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions
      .map((session) => {
        try {
          const photo = JSON.parse(session.suggestions);
          return {
            ...photo,
            savedAt: session.createdAt,
          };
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Error fetching saved photos:', error);
    throw error;
  }
}

export { getCuratedPhotos, savePhoto, getSavedPhotos };
