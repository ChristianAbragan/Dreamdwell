/**
 * Sanitizes and enriches LLM-generated furniture suggestions with Philippine pricing,
 * shop search links, and placement metadata the frontend can draw on the room image.
 */
export function sanitizeSuggestions(
  suggestions = [],
  zones = {},
  { city = 'Cagayan De Oro', roomType = 'room', detectedFurniture = [] } = {}
) {
  const normalizePrice = (val) => {
    const text = String(val || '').replace(/,/g, '');
    const numbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
    if (!numbers.length) return null;
    if (numbers.length >= 2 && /-|to|–|—/i.test(text)) {
      return Math.round((numbers[0] + numbers[1]) / 2);
    }
    return Math.round(numbers[0]);
  };

  const cityMultiplier = {
    Manila: 1.15,
    Cebu: 1.08,
    Davao: 1.05,
    'Cagayan De Oro': 1.0,
    Iloilo: 1.02,
    Bacolod: 1.01,
  }[city] || 1.0;

  return suggestions.map((s) => {
    const item = String(s.item || s.name || s.product || 'Item').trim();
    const basePrice = normalizePrice(s.price || s.price_php || s.peso) || 2500;
    const pricePhp = Math.round(basePrice * cityMultiplier);
    const zone = s.zone || s.targetSurface || _inferZone(item, zones);
    const shopQuery = encodeURIComponent(`${item} furniture decor ${city}`);

    return {
      item,
      reason: String(s.reason || s.rationale || s.why || '').slice(0, 240),
      price_php: `PHP ${pricePhp.toLocaleString()}`,
      price_value: pricePhp,
      distance: String(s.distance || 'Nearby store search'),
      shop_url: s.shop_url || s.url || s.link || `https://www.openstreetmap.org/search?query=${shopQuery}`,
      roomType,
      zone,
      targetSurface: s.targetSurface || zone,
      placementLabel:
        s.placementLabel || s.placement || `Place on the ${String(zone).replace('_', ' ')}`,
      points: normalizePoints(s.points || s.anchor_points || s.corners),
      confidence: s.confidence || (detectedFurniture.length ? 'medium' : 'low'),
      priority: Number(s.priority) || 0,
    };
  });
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;

  const normalized = points.map((point) => {
    if (Array.isArray(point)) return point.map(Number);
    return [Number(point?.x), Number(point?.y)];
  });

  return normalized.every(
    (point) =>
      point.length === 2 &&
      point.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
  )
    ? normalized
    : null;
}

function _inferZone(item, zones) {
  const low = item.toLowerCase();
  if (/rug|mat|carpet|floor/.test(low)) return 'floor';
  if (/lamp|chandelier|ceiling|wall.?light|sconce/.test(low)) return 'ceiling';
  if (/shelf|painting|frame|mirror|clock/.test(low)) return 'upper_wall';
  return zones?.lower_wall ? 'lower_wall' : 'floor';
}
