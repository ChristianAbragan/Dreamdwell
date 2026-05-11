const DREAMDWELL_CONTEXT_KEY = 'dreamdwellRecentContext';
const DREAMDWELL_CHAT_KEY = 'dreamdwellAssistantChat';
const DREAMDWELL_LAST_SCAN_KEY = 'dreamdwellLastScan';

const scopedKey = (key, userId) => (userId ? `${key}:${userId}` : key);

const readStorage = (key, fallback, userId) => {
  try {
    const scopedValue = localStorage.getItem(scopedKey(key, userId));
    const legacyValue = userId ? null : localStorage.getItem(key);
    const parsed = JSON.parse(scopedValue || legacyValue || JSON.stringify(fallback));
    return parsed;
  } catch (_error) {
    return fallback;
  }
};

const writeStorage = (key, value, userId) => {
  try {
    localStorage.setItem(scopedKey(key, userId), JSON.stringify(value));
  } catch (_error) {
    // Ignore local persistence failures.
  }
};

const normalizeContextEntry = (entry) => ({
  text: `${entry?.text || ''}`.trim(),
  source: entry?.source || 'unknown',
  createdAt: entry?.createdAt || new Date().toISOString(),
});

export const readRecentContext = (userId) => {
  try {
    const parsed = readStorage(DREAMDWELL_CONTEXT_KEY, [], userId);
    return Array.isArray(parsed)
      ? parsed.map(normalizeContextEntry).filter((entry) => entry.text)
      : [];
  } catch (_error) {
    return [];
  }
};

export const persistRecentContext = (entry, userId) => {
  try {
    const nextEntries = [normalizeContextEntry(entry), ...readRecentContext(userId)].filter(
      (item, index, array) => index === array.findIndex((candidate) => candidate.text === item.text)
    );

    writeStorage(DREAMDWELL_CONTEXT_KEY, nextEntries.slice(0, 18), userId);
  } catch (_error) {
    // Ignore local persistence failures.
  }
};

export const readAssistantChat = (fallback = [], userId) => {
  try {
    const parsed = readStorage(DREAMDWELL_CHAT_KEY, [], userId);
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
};

export const persistAssistantChat = (messages, userId) => {
  try {
    writeStorage(DREAMDWELL_CHAT_KEY, messages.slice(-30), userId);
  } catch (_error) {
    // Ignore local persistence failures.
  }
};

export const readLastScan = (fallback = {}, userId) => {
  const parsed = readStorage(DREAMDWELL_LAST_SCAN_KEY, fallback, userId);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
};

export const persistLastScan = (scan, userId) => {
  writeStorage(DREAMDWELL_LAST_SCAN_KEY, scan, userId);
};

export const inferDesignIntent = (text = '') => {
  const value = `${text}`.toLowerCase();
  const rules = [
    { matches: ['bed', 'beds', 'mattress', 'headboard', 'pillow', 'bedding'], room: 'bedroom', query: 'bed bedroom inspiration' },
    { matches: ['sofa', 'couch', 'sectional', 'coffee table', 'tv wall'], room: 'living room', query: 'living room sofa inspiration' },
    { matches: ['desk', 'office', 'workstation', 'study table'], room: 'office', query: 'office desk inspiration' },
    { matches: ['kitchen', 'island', 'cabinet', 'pantry'], room: 'kitchen', query: 'kitchen inspiration' },
    { matches: ['bath', 'bathroom', 'vanity', 'shower', 'tub'], room: 'bathroom', query: 'bathroom inspiration' },
    { matches: ['dining', 'dinner table', 'chairs'], room: 'dining room', query: 'dining room inspiration' },
    { matches: ['light', 'lamp', 'lighting', 'chandelier', 'sconce'], room: '', query: 'interior lighting inspiration' },
    { matches: ['plant', 'greenery', 'indoor plants'], room: '', query: 'indoor plants interior inspiration' },
  ];

  return rules.find((rule) => rule.matches.some((match) => value.includes(match))) || null;
};
