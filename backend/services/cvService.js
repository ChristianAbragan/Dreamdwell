import sharp from 'sharp';

const clampPercent = (value, min = 0, max = 100) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const parseImageBuffer = (imageBase64) => {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('Missing image payload');
  }

  const payload = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  return Buffer.from(payload, 'base64');
};

const movingAverage = (values, radius = 2) =>
  values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = values[index + offset];
      if (sample !== undefined) {
        total += sample;
        count += 1;
      }
    }
    return count ? total / count : values[index];
  });

const classifyFurniture = (width, height) => {
  const aspect = width / Math.max(1, height);
  if (aspect > 2.5 && height < 12) return 'table';
  if (aspect > 1.8 && height > 12 && height < 25) return 'bed';
  if (aspect < 1.5 && height > 18) return 'sofa';
  return 'furniture';
};

const zoneMap = {
  ceiling: { label: 'ceiling', top: 0, bottom: 18 },
  'upper_wall': { label: 'upper-wall', top: 18, bottom: 45 },
  'lower_wall': { label: 'lower-wall', top: 45, bottom: 70 },
  floor: { label: 'floor', top: 70, bottom: 100 }
};

const getZoneRel = (centerY, zones) => {
  for (const [zoneKey, zone] of Object.entries(zones || {})) {
    if (centerY >= zone.top && centerY <= zone.bottom) {
      return zoneKey.replace('_', '-');
    }
  }
  return 'floor';
};

const getRelPosition = (centerX) => {
  if (centerX < 33) return 'left';
  if (centerX > 67) return 'right';
  return 'center';
};

const estAngleDeg = (edgeVDiffs, left, right, top, bottom) => {
  const midTop = Math.floor(top + (bottom - top) * 0.25);
  const midBottom = Math.floor(top + (bottom - top) * 0.75);
  const midLeft = Math.floor(left + (right - left) * 0.25);
  const midRight = Math.floor(left + (right - left) * 0.75);
  
  // Simple slope from edgeV diffs
  const avgTopEdge = (edgeVDiffs[midTop] || 0) + (edgeVDiffs[midTop + 1] || 0);
  const avgBottomEdge = (edgeVDiffs[midBottom] || 0) + (edgeVDiffs[midBottom + 1] || 0);
  const angle = Math.abs(avgTopEdge - avgBottomEdge) / 5; // Scale to degrees
  return Math.min(angle, 15).toFixed(1); // Max 15deg tilt
};

const estDimsFt = (wPct, hPct, scale = 0.12) => { // Assume 10ft room depth
  const wFt = (wPct * scale).toFixed(1);
  const hFt = (hPct * scale).toFixed(1);
  return `${wFt}x${hFt}ft`;
};

const buildFurnitureCandidate = (item, imageHeight, edgeVDiffs, zones = {}) => {
  const itemTop = clampPercent((item.top / imageHeight) * 100);
  const itemBottom = clampPercent((item.bottom / imageHeight) * 100);
  const itemLeft = clampPercent(item.left);
  const itemRight = clampPercent(item.right);
  const itemHeight = itemBottom - itemTop;
  const itemWidth = itemRight - itemLeft;
  const area = itemWidth * itemHeight;
  const centerX = (itemLeft + itemRight) / 2;
  const centerY = (itemTop + itemBottom) / 2;

  if (itemHeight < 8 || area < 180) return null;

  const looksLikeFloorTexture =
    centerY >= 68 ||
    (itemBottom >= 92 && itemWidth > 45) ||
    (itemWidth > 68 && itemHeight < 26) ||
    (itemWidth / Math.max(1, itemHeight) > 3.6 && itemHeight < 28);

  if (looksLikeFloorTexture) return null;

  const type = classifyFurniture(itemWidth, itemHeight);
  const zoneRel = getZoneRel(centerY, zoneMap);
  const relPos = getRelPosition(centerX);
  const angleDeg = estAngleDeg(edgeVDiffs || [], itemLeft, itemRight, itemTop, itemBottom);
  const dimsStr = estDimsFt(itemWidth, itemHeight);

  return {
    type,
    left: itemLeft,
    right: itemRight,
    top: itemTop,
    bottom: itemBottom,
    width: Number(itemWidth.toFixed(1)),
    height: Number(itemHeight.toFixed(1)),
    area: Number(area.toFixed(1)),
    relPosition: relPos,
    zoneRel,
    angleDeg: Number(angleDeg),
    dimsStr,
    center: { x: Number(centerX.toFixed(1)), y: Number(centerY.toFixed(1)) }
  };
};

export async function estimateRoomGeometry(imageBase64) {
  const input = parseImageBuffer(imageBase64);
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 320, withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const rows = Array.from({ length: height }, () => ({ brightness: 0, edgeH: 0, edgeV: 0 }));

  // Compute edgeV diffs for angle estimation
  const edgeVDiffs = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    let brightnessSum = 0;
    let edgeHSum = 0;
    let edgeVSum = 0;

    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const pixel = data[idx];
      brightnessSum += pixel;
      if (x > 0) {
        const vDiff = Math.abs(pixel - data[idx - 1]);
        edgeVSum += vDiff;
        edgeVDiffs[y] += vDiff;
      }
      if (y > 0) edgeHSum += Math.abs(pixel - data[idx - width]);
    }

    rows[y] = {
      brightness: brightnessSum / width,
      edgeH: edgeHSum / Math.max(1, width - 1),
      edgeV: edgeVSum / Math.max(1, width - 1),
    };
  }

  edgeVDiffs.forEach((_, i) => edgeVDiffs[i] /= width);

  const brightness = movingAverage(rows.map((row) => row.brightness), 4);
  const edgeH = movingAverage(rows.map((row) => row.edgeH), 4);
  const edgeV = movingAverage(rows.map((row) => row.edgeV), 4);
  const brightnessDiff = brightness.map((value, y) =>
    y < height - 1 ? Math.abs(value - brightness[y + 1]) : 0
  );

  // Floor/ceiling logic unchanged...
  const floorSearchStart = Math.floor(height * 0.50);
  const floorSearchEnd = Math.min(Math.floor(height * 0.92), height - 4);
  let bestFloorY = Math.floor(height * 0.74);
  let bestFloorScore = -Infinity;

  for (let y = floorSearchStart; y <= floorSearchEnd; y += 1) {
    const score =
      edgeH[y] * 1.35 +
      brightnessDiff[y] * 0.55 +
      (y / height) * 1.2 -
      Math.abs(edgeV[y] - edgeV[Math.max(0, y - 1)]) * 0.05;

    if (score > bestFloorScore) {
      bestFloorScore = score;
      bestFloorY = y;
    }
  }

  const ceilingSearchStart = Math.max(2, Math.floor(height * 0.04));
  const ceilingSearchEnd = Math.min(Math.floor(height * 0.32), height - 4);
  let bestCeilingY = Math.floor(height * 0.14);
  let bestCeilingScore = -Infinity;

  for (let y = ceilingSearchStart; y <= ceilingSearchEnd; y += 1) {
    const score =
      edgeH[y] * 0.95 +
      brightnessDiff[y] * 0.6 -
      (y / height) * 0.35 +
      ((brightness[y] - brightness[Math.min(height - 1, y + 1)]) / 24);

    if (score > bestCeilingScore) {
      bestCeilingScore = score;
      bestCeilingY = y;
    }
  }

  if (bestCeilingY >= bestFloorY - 6) {
    bestCeilingY = Math.max(4, Math.floor(height * 0.12));
  }

  const ceilingBottom = clampPercent((bestCeilingY / height) * 100, 4, 28);
  const floorTop = clampPercent((bestFloorY / height) * 100, 54, 92);
  const wallSpan = Math.max(18, floorTop - ceilingBottom);
  const upperWallBottom = clampPercent(
    ceilingBottom + wallSpan * 0.46,
    ceilingBottom + 8,
    floorTop - 8
  );
  const lowerWallTop = clampPercent(upperWallBottom, ceilingBottom + 8, floorTop - 8);

  const wallTopPx = Math.floor((ceilingBottom / 100) * height);
  const wallBottomPx = Math.floor((floorTop / 100) * height);
  const windowTopPx = Math.floor(wallTopPx + (wallBottomPx - wallTopPx) * 0.08);
  const windowBottomPx = Math.min(height - 1, Math.floor(wallTopPx + (wallBottomPx - wallTopPx) * 0.55));

  const columnScores = [];
  for (let x = 0; x < width; x += 1) {
    let brightnessSum = 0;
    let edgeSum = 0;
    let count = 0;

    for (let y = windowTopPx; y < windowBottomPx; y += 1) {
      const idx = y * width + x;
      const pixel = data[idx];
      brightnessSum += pixel;
      if (y > windowTopPx) edgeSum += Math.abs(pixel - data[idx - width]);
      count += 1;
    }

    columnScores.push({
      brightness: count ? brightnessSum / count : 0,
      edge: count ? edgeSum / count : 0,
    });
  }

  const meanBrightness =
    columnScores.reduce((sum, column) => sum + column.brightness, 0) /
    Math.max(1, columnScores.length);
  const meanEdge =
    columnScores.reduce((sum, column) => sum + column.edge, 0) /
    Math.max(1, columnScores.length);

  let runStart = -1;
  let longestRun = 0;
  let windowStart = -1;
  let windowEnd = -1;
  const brightnessThreshold = meanBrightness + 16;
  const edgeThreshold = meanEdge * 1.03;

  columnScores.forEach((column, index) => {
    const looksLikeWindow = column.brightness > brightnessThreshold && column.edge < edgeThreshold;

    if (looksLikeWindow && runStart === -1) runStart = index;
    if (!looksLikeWindow && runStart !== -1) {
      const length = index - runStart;
      if (length > longestRun) {
        longestRun = length;
        windowStart = runStart;
        windowEnd = index - 1;
      }
      runStart = -1;
    }
  });

  if (runStart !== -1) {
    const length = columnScores.length - runStart;
    if (length > longestRun) {
      longestRun = length;
      windowStart = runStart;
      windowEnd = columnScores.length - 1;
    }
  }

  const hasWindow = longestRun > width * 0.10;

  // Enhanced Furniture Detection
  const furniture = [];
  const furnitureDetails = []; // New detailed array

  const floorTopPx = Math.floor((floorTop / 100) * height);
  const floorBottomPx = Math.floor(height * 0.98);
  const darkThreshold = 72;
  const rowObjects = [];

  for (let y = floorTopPx; y < Math.min(floorBottomPx, height); y += 1) {
    let inObject = false;
    let objectStart = -1;
    let objectPixels = 0;
    let darkPixels = 0;

    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const isDark = data[idx] < darkThreshold;

      if (isDark) {
        darkPixels += 1;
        if (!inObject) {
          inObject = true;
          objectStart = x;
        }
        objectPixels += 1;
      } else {
        if (inObject && objectPixels > width * 0.12) {
          rowObjects.push({
            y,
            left: clampPercent((objectStart / width) * 100),
            right: clampPercent((x / width) * 100),
            coverage: objectPixels / width,
          });
        }
        inObject = false;
        objectStart = -1;
        objectPixels = 0;
      }
    }

    if (inObject && objectPixels > width * 0.12) {
      rowObjects.push({
        y,
        left: clampPercent((objectStart / width) * 100),
        right: clampPercent((width / width) * 100),
        coverage: objectPixels / width,
      });
    }
  }

  // Cluster into detailed furniture
  let currentItem = null;
  rowObjects.forEach((row) => {
    if (!currentItem) {
      currentItem = { top: row.y, bottom: row.y, left: row.left, right: row.right, rows: 1 };
    } else if (row.left <= currentItem.right + 8 && row.right >= currentItem.left - 8) {
      currentItem.bottom = row.y;
      currentItem.left = Math.min(currentItem.left, row.left);
      currentItem.right = Math.max(currentItem.right, row.right);
      currentItem.rows += 1;
    } else {
      if (currentItem.rows >= 3) {
        const candidate = buildFurnitureCandidate(currentItem, height, edgeVDiffs);
        if (candidate) {
          furniture.push(candidate);
          furnitureDetails.push(candidate); // Detailed version
        }
      }
      currentItem = { top: row.y, bottom: row.y, left: row.left, right: row.right, rows: 1 };
    }
  });

  if (currentItem && currentItem.rows >= 3) {
    const candidate = buildFurnitureCandidate(currentItem, height, edgeVDiffs);
    if (candidate) {
      furniture.push(candidate);
      furnitureDetails.push(candidate);
    }
  }

  // Room type inference (enhanced)
  let inferredRoomType = 'room';
  const hasBed = furnitureDetails.some((f) => f.type === 'bed');
  const hasTable = furnitureDetails.some((f) => f.type === 'table');
  const hasSofa = furnitureDetails.some((f) => f.type === 'sofa');

  if (hasBed && furnitureDetails.length <= 2) inferredRoomType = 'bedroom';
  else if (hasSofa && furnitureDetails.length >= 1) inferredRoomType = 'living room';
  else if (hasTable && !hasBed) inferredRoomType = 'dining room';
  else if (!hasBed && !hasSofa && hasWindow) inferredRoomType = 'office';

  const confidenceScore = Math.max(
    0,
    Math.min(
      1,
      0.35 +
        (bestFloorScore / 40) * 0.25 +
        ((meanEdge + 1) / 18) * 0.2 +
        (hasWindow ? 0.12 : 0) +
        ((floorTop - ceilingBottom) / 100) * 0.2 +
        (furnitureDetails.length > 0 ? 0.08 : 0)
    )
  );

  // Camera/perspective est
  const cameraHeightEst = hasWindow ? 'eye-level (5.5ft)' : 'standard room scan';
  const perspective = wallSpan > 40 ? 'wide-angle' : 'normal';

  return {
    source: 'local-cv',
    confidence:
      confidenceScore >= 0.72 ? 'high' : confidenceScore >= 0.48 ? 'medium' : 'low',
    width,
    height,
    aspectRatio: (width / height).toFixed(2),
    cameraHeight: cameraHeightEst,
    perspective,
    inferredRoomType,
    metrics: {
      floorStrength: Number(bestFloorScore.toFixed(2)),
      edgeMean: Number(meanEdge.toFixed(2)),
      brightnessMean: Number(meanBrightness.toFixed(2)),
      confidenceScore: Number(confidenceScore.toFixed(2)),
      furnitureCount: furnitureDetails.length,
    },
    zones: {
      ceiling: { top: 0, bottom: ceilingBottom },
      upper_wall: { top: ceilingBottom, bottom: upperWallBottom },
      lower_wall: { top: lowerWallTop, bottom: floorTop },
      floor: { top: floorTop, bottom: 100 },
      window: hasWindow
        ? {
            exists: true,
            left: clampPercent((windowStart / width) * 100, 0, 96),
            right: clampPercent(((windowEnd + 1) / width) * 100, 4, 100),
            top: clampPercent(ceilingBottom + 4, 4, floorTop - 12),
            bottom: clampPercent(floorTop - 10, ceilingBottom + 12, floorTop - 4),
          }
        : { exists: false, left: 0, right: 0, top: 0, bottom: 0 },
    },
    furniture, // Legacy basic
    furnitureDetails, // NEW: Detailed for prompts [array of enhanced objects]
  };
}

