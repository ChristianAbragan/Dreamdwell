import express from 'express';
import Groq from 'groq-sdk';
import { estimateRoomGeometry } from '../services/cvService.js';
import { sanitizeSuggestions } from '../utils/suggestions.js';

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const svgEscape = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildLocalRecreatedScene = ({ analysis = '', suggestions = [], roomType = 'room' }) => {
  const width = 1200;
  const height = 820;
  const items = suggestions.slice(0, 6);
  const floorItems = items.filter((item) => /floor|rug|chair|desk|table|sofa|bed|shelf/i.test(`${item.targetSurface} ${item.item}`));
  const wallItems = items.filter((item) => !floorItems.includes(item));

  const furniture = floorItems.map((item, index) => {
    const x = 190 + (index % 3) * 270;
    const y = 560 + Math.floor(index / 3) * 76;
    const label = svgEscape(item.item || 'Item');
    return `
      <g>
        <rect x="${x}" y="${y}" width="190" height="54" rx="12" fill="#d8cab8" stroke="#9b8978" stroke-width="2"/>
        <rect x="${x + 14}" y="${y + 14}" width="162" height="14" rx="7" fill="#f2eadf" opacity="0.9"/>
        <text x="${x + 95}" y="${y + 37}" text-anchor="middle" font-family="Inter, Arial" font-size="15" fill="#403832">${label}</text>
      </g>`;
  }).join('');

  const wallDecor = wallItems.map((item, index) => {
    const x = 230 + (index % 3) * 230;
    const y = 210 + Math.floor(index / 3) * 86;
    const label = svgEscape(item.item || 'Decor');
    return `
      <g>
        <rect x="${x}" y="${y}" width="130" height="70" rx="8" fill="#eef1ec" stroke="#9aa8a1" stroke-width="2"/>
        <text x="${x + 65}" y="${y + 42}" text-anchor="middle" font-family="Inter, Arial" font-size="13" fill="#48524b">${label}</text>
      </g>`;
  }).join('');

  const summary = svgEscape(analysis.slice(0, 150));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="wall" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#f7f4ee"/>
          <stop offset="100%" stop-color="#ddd8cd"/>
        </linearGradient>
        <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#d7b47f"/>
          <stop offset="100%" stop-color="#b98d4f"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="820" fill="#f4f1eb"/>
      <polygon points="130,120 1070,120 980,520 220,520" fill="url(#wall)" stroke="#c9c1b4" stroke-width="3"/>
      <polygon points="220,520 980,520 1160,800 40,800" fill="url(#floor)"/>
      <g opacity="0.22" stroke="#7c5a32">
        ${Array.from({ length: 12 }).map((_, i) => `<line x1="${70 + i * 95}" y1="800" x2="${250 + i * 58}" y2="520"/>`).join('')}
        ${Array.from({ length: 7 }).map((_, i) => `<line x1="${80 + i * 15}" y1="${560 + i * 38}" x2="${1120 - i * 15}" y2="${560 + i * 38}"/>`).join('')}
      </g>
      <rect x="690" y="205" width="190" height="170" rx="10" fill="#f8fbff" stroke="#bfc7cc" stroke-width="8"/>
      <line x1="785" y1="210" x2="785" y2="370" stroke="#bfc7cc" stroke-width="5"/>
      <rect x="705" y="220" width="160" height="140" fill="#dceef7" opacity="0.55"/>
      ${wallDecor}
      ${furniture}
      <text x="60" y="64" font-family="Inter, Arial" font-size="24" font-weight="700" fill="#302b25">DreamDwell recreated ${svgEscape(roomType)}</text>
      <text x="60" y="96" font-family="Inter, Arial" font-size="16" fill="#7a7169">${summary}</text>
    </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

// POST /api/rooms/audit-room
router.post('/audit-room', async (req, res) => {
  const { imageBase64, city = 'Cagayan De Oro', profile = {} } = req.body;
  try {
    const geometry = await estimateRoomGeometry(imageBase64);
    const zones = geometry.zones;
    const furnitureDetails = geometry.furnitureDetails || [];

    // Detailed furniture desc
    const furnitureDesc = furnitureDetails.length
      ? furnitureDetails.map((f, i) => `- ${f.type.toUpperCase()} ${i + 1}: ${f.dimsStr} (${f.relPosition}-${f.zoneRel}, ${f.angleDeg}°)`).join('\\n')
      : '- EMPTY room.';

    const wallHtEst = ((zones.floor.top - zones.ceiling.bottom) * 0.12).toFixed(1) + 'ft';
    const preferredRoomType = profile?.favoriteRoom || 'room';
    const aiSettings = profile?.aiSettings || {};
    const allowedModels = new Set([
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]);
    const model = allowedModels.has(aiSettings.model)
      ? aiSettings.model
      : 'meta-llama/llama-4-scout-17b-16e-instruct';
    const temperature = Number.isFinite(Number(aiSettings.temperature))
      ? Math.min(1.4, Math.max(0.2, Number(aiSettings.temperature)))
      : 0.75;

    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `J.A.R.V.I.S. room analysis.

CV: ${geometry.inferredRoomType} (${geometry.confidence}), ${geometry.width}x${geometry.height}px, ${geometry.cameraHeight} ${geometry.perspective}, ${wallHtEst}.

ZONES:
Ceiling: ${zones.ceiling.top}-${zones.ceiling.bottom}%
Upper wall: ${zones.upper_wall.top}-${zones.upper_wall.bottom}%
Lower wall: ${zones.lower_wall.top}-${zones.lower_wall.bottom}%
Floor: ${zones.floor.top}-100%

FURNITURE (NO overlap):
${furnitureDesc}

RULES:
- Do not reuse a fixed shopping list. Recommendations must be based on this exact image, room type, visible gaps, light, proportions, and existing furniture.
- If the room is empty, suggest essentials that fit the inferred room purpose (${geometry.inferredRoomType}) and the user's preferred room direction (${preferredRoomType}); do not always suggest TV stand, sofa, coffee table, rug, lamp.
- If furniture exists, avoid duplicates and recommend only missing, practical improvements.
- Items BESIDE furniture (rug next to bed, not ON). No overlap with detected furniture.
- No chandelier if ceiling fixture.
- Every suggestion must include item, reason, price_php, targetSurface, placementLabel, confidence, and points.
- points must be 4 percentage-coordinate corners [[x,y],[x,y],[x,y],[x,y]] inside 0-100 that mark exactly where the item should be placed on the image.
- The reason must mention what you saw in the image that caused the suggestion.
- Include local-shopping wording for ${city}; use shop_url only when you know a real useful URL, otherwise leave it empty.

JSON only: explanation, analysis_summary, added_elements, audit, suggestions[6-8], visual_prompt, source_recreation_prompt (\"${geometry.width}x${geometry.height}px exact scene, preserve furniture pos/dims: ${furnitureDesc}\"), zones.`,
        }, { type: 'image_url', image_url: { url: imageBase64 } }],
      }],
      model,
      temperature,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    const detectedFurniture = furnitureDetails;
    const suggestions = sanitizeSuggestions(parsed.suggestions || [], zones, {
      city,
      roomType: geometry.inferredRoomType,
      detectedFurniture,
    });

    res.json({
      ...parsed,
      geometry,
      suggestions,
      zones,
      local_recreated_scene: buildLocalRecreatedScene({
        analysis: parsed.analysis_summary || parsed.explanation,
        suggestions,
        roomType: geometry.inferredRoomType,
      }),
    });
  } catch (error) {
    console.error('Audit-room error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// POST /api/rooms/room-chat
router.post('/room-chat', async (req, res) => {
  const { message, scanContext = {}, userContext = {} } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            "You are Archi, a warm and practical interior design assistant for DreamDwell. " +
            "Keep replies concise, conversational, and actionable. " +
            "You help users with room design, furniture suggestions, style advice, and shopping recommendations. " +
            "Speak like a thoughtful design partner — friendly, calm, and collaborative. " +
            "Use plain English. Avoid AI roleplay language.",
        },
        {
          role: 'user',
          content: `User: ${message}\n\nContext: ${JSON.stringify({ scanContext, userContext })}`,
        },
      ],
      model: 'llama-3.3-70b-versatile',
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error('Room-chat error:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// POST /api/rooms/generate-blueprint
router.post('/generate-blueprint', async (req, res) => {
  // Move from server.js - placeholder
  res.json({ imageUrl: 'Blueprint route ready' });
});

export default router;

