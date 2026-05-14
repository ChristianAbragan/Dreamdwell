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

const compactPrompt = (value = '', maxLength = 1200) =>
  String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);

const buildFallbackRecreationPrompt = ({ analysis = '', suggestions = [] }) => {
  const suggestionItems = suggestions
    .slice(0, 8)
    .map((item) => {
      const placement = item.placementLabel || item.targetSurface || 'the room';
      const reason = item.reason ? `, suggested because ${item.reason}` : '';
      return `${item.item} anchored at ${placement}${reason}`;
    })
    .join(', ');

  const base = analysis || 'a photographed residential room with similar architecture, furniture, textures, light direction, floor plane, walls, windows, and current layout';

  return suggestionItems
    ? `A high-resolution architectural photograph of a room visually similar to the analyzed space, ${base}, ${suggestionItems}, cohesive interior design synthesis, matching perspective and room proportions, realistic depth and occlusion, material and texture fidelity with matte wood, woven textiles, brushed metal, reflective glass, ceramic surfaces, unified natural lighting wrapping around existing and new objects, realistic contact shadows, style-consistent decor, architectural photography, soft diffused natural light, 8k resolution, photorealistic, shot on 35mm lens`
    : `A high-resolution architectural photograph of a room visually similar to the analyzed space, ${base}, matching perspective and room proportions, realistic depth, material and texture fidelity, unified natural lighting, architectural photography, soft diffused natural light, 8k resolution, photorealistic, shot on 35mm lens`;
};

const buildPollinationsUrl = (promptText = '') =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(compactPrompt(promptText))}?width=1024&height=1024&nologo=true&seed=42`;

const generateRecreationPrompt = async ({ parsed, geometry, suggestions }) => {
  const baseScene = [
    parsed.analysis_summary || parsed.explanation || '',
    parsed.visual_prompt ? `Visual notes: ${parsed.visual_prompt}` : '',
    parsed.source_recreation_prompt ? `Source preservation notes: ${parsed.source_recreation_prompt}` : '',
    geometry?.inferredRoomType ? `Inferred room type: ${geometry.inferredRoomType}.` : '',
    geometry?.perspective ? `Camera perspective: ${geometry.perspective}.` : '',
  ].filter(Boolean).join('\n');

  const designSuggestions = suggestions.map((item, index) => ({
    number: index + 1,
    item: item.item,
    placement: item.placementLabel || item.targetSurface || item.zone,
    reason: item.reason,
    price_php: item.price_php,
    anchor_points_percent: item.points,
  }));

  const fallbackPrompt = buildFallbackRecreationPrompt({
    analysis: baseScene,
    suggestions,
  });

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Role: You are a master architectural visualization prompt engineer, specializing in hyper-realistic interior design synthesis. Your task is to generate a single, highly detailed, comma-separated text-to-image prompt optimized for advanced diffusion models.

Task: You will be provided with three dynamic inputs from our analysis pipeline:
[Base Scene Analysis]: The current state of the room. This includes architecture, window placements, lighting sources, and any existing furniture, decor, or textures.
[Modification Intent]: The user's goal, such as add new items, replace existing items, or complete redesign.
[Design Suggestions & Spatial Anchors]: The new items to introduce, along with explicit instructions on where they go relative to the architecture or the existing furniture.

Rules for the Output Prompt:
* Cohesive Synthesis: Do not list the old and new items separately. Weave them together into a single, photorealistic snapshot. The new items must feel naturally integrated into the existing space.
* Spatial Awareness: Pay strict attention to spatial anchors. If a suggestion is "on the side table," ensure the side table from the Base Scene is described with the new item resting on it. Address occlusion, such as partially obscuring the window.
* Material & Texture Fidelity: Describe both existing and new items with extreme material specificity, such as matte walnut wood, slubby olive linen, brushed brass, reflective glass.
* Unified Lighting: Describe how the primary light source interacts with the entire scene. Note how light wraps around the new objects or casts shadows onto existing ones.
* Style Consistency: Ensure the new suggestions match or complement the aesthetic established in the Base Scene unless instructed otherwise.
* Formatting: Return only the final, comma-separated image generation prompt. Include photographic modifiers at the end, such as architectural photography, soft diffused natural light, 8k resolution, photorealistic, shot on 35mm lens. Do not include markdown, conversational text, or prefixes.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            base_scene_analysis: baseScene,
            modification_intent: 'Keep a clear glimpse of similarity to the analyzed room architecture, camera angle, layout, lighting, and visible furniture. Add the suggested decor and furniture items naturally.',
            design_suggestions_and_spatial_anchors: designSuggestions,
          }),
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
    });

    return compactPrompt(completion.choices[0].message.content || fallbackPrompt);
  } catch (error) {
    console.error('Recreation prompt generation failed:', error.message);
    return compactPrompt(fallbackPrompt);
  }
};

const generateAISuggestions = (analysis, roomType) => {
  // Placeholder for AI suggestion generation logic
  return [
    { item: 'AI-generated Sofa', targetSurface: 'floor' },
    { item: 'AI-generated Painting', targetSurface: 'wall' },
    { item: 'AI-generated Rug', targetSurface: 'floor' },
  ];
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

    const recreationPrompt = await generateRecreationPrompt({
      parsed,
      geometry,
      suggestions,
    });

    res.json({
      ...parsed,
      geometry,
      suggestions,
      zones,
      local_recreated_scene: buildLocalRecreatedScene({
        analysis: parsed.analysis_summary || parsed.explanation,
        suggestions: generateAISuggestions(parsed.analysis_summary || parsed.explanation, geometry.inferredRoomType),
        roomType: geometry.inferredRoomType,
      }),
      source_recreation_prompt: recreationPrompt,
      generated_scene_url: buildPollinationsUrl(recreationPrompt),
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
