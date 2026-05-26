/**
 * 水印去除核心算法
 * 注意：微信小程序无全局 ImageData 构造函数，所有函数直接修改传入的 imageData
 */

/**
 * 自动检测四角水印区域
 */
function detectCornerWatermarks(imageData, w, h) {
  const cornerRatio = 0.22;
  const results = [];

  const corners = [
    { x0: 0, y0: 0 },
    { x0: Math.floor(w * (1 - cornerRatio)), y0: 0 },
    { x0: 0, y0: Math.floor(h * (1 - cornerRatio)) },
    { x0: Math.floor(w * (1 - cornerRatio)), y0: Math.floor(h * (1 - cornerRatio)) }
  ];

  for (const corner of corners) {
    const cw = Math.floor(w * cornerRatio);
    const ch = Math.floor(h * cornerRatio);
    const region = detectWatermarkInRegion(imageData, w, h, corner.x0, corner.y0, cw, ch);
    if (region && region.w > 15 && region.h > 8) {
      results.push(region);
    }
  }

  return results;
}

function detectWatermarkInRegion(imageData, imgW, imgH, rx, ry, rw, rh) {
  var data = imageData.data;
  var edgeMap = [];
  var maxEdge = 0;

  for (var y = ry + 1; y < ry + rh - 1; y++) {
    for (var x = rx + 1; x < rx + rw - 1; x++) {
      var gx = gray(data, (y - 1) * imgW + (x + 1)) - gray(data, (y - 1) * imgW + (x - 1))
             + 2 * gray(data, y * imgW + (x + 1)) - 2 * gray(data, y * imgW + (x - 1))
             + gray(data, (y + 1) * imgW + (x + 1)) - gray(data, (y + 1) * imgW + (x - 1));
      var gy = gray(data, (y - 1) * imgW + (x - 1)) - gray(data, (y + 1) * imgW + (x - 1))
             + 2 * gray(data, (y - 1) * imgW + x) - 2 * gray(data, (y + 1) * imgW + x)
             + gray(data, (y - 1) * imgW + (x + 1)) - gray(data, (y + 1) * imgW + (x + 1));
      var mag = Math.sqrt(gx * gx + gy * gy);
      edgeMap.push(mag);
      if (mag > maxEdge) maxEdge = mag;
    }
  }

  if (maxEdge < 20) return null;

  var threshold = maxEdge * 0.4;
  var minX = rw, minY = rh, maxX = 0, maxY = 0;
  var edgeCount = 0;

  for (var i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] >= threshold) {
      var ex = (i % (rw - 2));
      var ey = Math.floor(i / (rw - 2));
      if (ex < minX) minX = ex;
      if (ex > maxX) maxX = ex;
      if (ey < minY) minY = ey;
      if (ey > maxY) maxY = ey;
      edgeCount++;
    }
  }

  if (edgeCount < 30) return null;

  var padding = 8;
  return {
    x: Math.max(rx, rx + minX - padding),
    y: Math.max(ry, ry + minY - padding),
    w: Math.min(rw, maxX - minX + padding * 2),
    h: Math.min(rh, maxY - minY + padding * 2)
  };
}

function gray(data, idx) {
  var i = idx * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

/**
 * 用周围像素填充水印区域 —— 直接修改 imageData
 */
function fillWatermarkRegion(imageData, imgWidth, imgHeight, region) {
  var rx = region.x, ry = region.y, rw = region.w, rh = region.h;
  var data = imageData.data;
  var borderPixels = [];

  // 上边界
  for (var col = rx; col < rx + rw && col < imgWidth; col++) {
    var sy = Math.max(0, ry - 1);
    var idx = (sy * imgWidth + Math.min(col, imgWidth - 1)) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  // 下边界
  for (var col = rx; col < rx + rw && col < imgWidth; col++) {
    var sy = Math.min(imgHeight - 1, ry + rh);
    var idx = (sy * imgWidth + Math.min(col, imgWidth - 1)) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  // 左边界
  for (var row = ry; row < ry + rh && row < imgHeight; row++) {
    var sx = Math.max(0, rx - 1);
    var idx = (Math.min(row, imgHeight - 1) * imgWidth + sx) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  // 右边界
  for (var row = ry; row < ry + rh && row < imgHeight; row++) {
    var sx = Math.min(imgWidth - 1, rx + rw);
    var idx = (Math.min(row, imgHeight - 1) * imgWidth + sx) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }

  if (borderPixels.length === 0) return imageData;

  // 背景是否接近纯色
  var sumR = 0, sumG = 0, sumB = 0;
  for (var p = 0; p < borderPixels.length; p++) {
    sumR += borderPixels[p][0];
    sumG += borderPixels[p][1];
    sumB += borderPixels[p][2];
  }
  var avgR = sumR / borderPixels.length;
  var avgG = sumG / borderPixels.length;
  var avgB = sumB / borderPixels.length;

  var variance = 0;
  for (var p = 0; p < borderPixels.length; p++) {
    variance += Math.pow(borderPixels[p][0] - avgR, 2)
              + Math.pow(borderPixels[p][1] - avgG, 2)
              + Math.pow(borderPixels[p][2] - avgB, 2);
  }
  variance /= borderPixels.length;
  var isSolidBg = variance < 400;

  for (var py = ry; py < ry + rh && py < imgHeight; py++) {
    for (var px = rx; px < rx + rw && px < imgWidth; px++) {
      var idx = (py * imgWidth + px) * 4;
      if (isSolidBg) {
        data[idx] = avgR;
        data[idx + 1] = avgG;
        data[idx + 2] = avgB;
        data[idx + 3] = 255;
      } else {
        var nearest = pickNearestBorder(borderPixels, rx, ry, rw, rh, px, py);
        if (nearest) {
          data[idx] = nearest[0];
          data[idx + 1] = nearest[1];
          data[idx + 2] = nearest[2];
          data[idx + 3] = nearest[3];
        }
      }
    }
  }

  return imageData;
}

function pickNearestBorder(borderPixels, rx, ry, rw, rh, px, py) {
  var dTop = py - ry;
  var dBottom = ry + rh - py;
  var dLeft = px - rx;
  var dRight = rx + rw - px;
  var minD = Math.min(dTop, dBottom, dLeft, dRight);

  var startIdx, endIdx;
  if (minD === dTop)         { startIdx = 0; endIdx = rw; }
  else if (minD === dBottom) { startIdx = rw; endIdx = rw * 2; }
  else if (minD === dLeft)   { startIdx = rw * 2; endIdx = rw * 2 + rh; }
  else                       { startIdx = rw * 2 + rh; endIdx = rw * 2 + rh * 2; }

  var sumR = 0, sumG = 0, sumB = 0, sumA = 0, n = 0;
  for (var i = startIdx; i < endIdx && i < borderPixels.length; i++) {
    sumR += borderPixels[i][0];
    sumG += borderPixels[i][1];
    sumB += borderPixels[i][2];
    sumA += borderPixels[i][3];
    n++;
  }
  if (n === 0) return null;
  return [sumR / n, sumG / n, sumB / n, sumA / n];
}

/**
 * 自动估算平铺水印参数
 */
function autoEstimateTiledWatermark(imageData, imgWidth, imgHeight) {
  var data = imageData.data;
  var patchSize = 32;
  var numPatches = 20;

  var pairs = [];
  for (var i = 0; i < numPatches; i++) {
    var x1 = Math.floor(Math.random() * (imgWidth - patchSize));
    var y1 = Math.floor(Math.random() * (imgHeight - patchSize));
    var x2 = Math.floor(Math.random() * (imgWidth - patchSize));
    var y2 = Math.floor(Math.random() * (imgHeight - patchSize));
    pairs.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
  }

  var diffs = [];
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var avg1 = avgPatch(data, imgWidth, pair.x1, pair.y1, patchSize);
    var avg2 = avgPatch(data, imgWidth, pair.x2, pair.y2, patchSize);
    var diff = Math.abs(avg1.r - avg2.r) + Math.abs(avg1.g - avg2.g) + Math.abs(avg1.b - avg2.b);
    if (diff < 60) {
      diffs.push({
        dr: Math.abs(avg1.r - avg2.r),
        dg: Math.abs(avg1.g - avg2.g),
        db: Math.abs(avg1.b - avg2.b)
      });
    }
  }

  if (diffs.length < 3) {
    return { r: 180, g: 180, b: 180, alpha: 0.1 };
  }

  diffs.sort(function (a, b) { return (a.dr + a.dg + a.db) - (b.dr + b.dg + b.db); });
  var mid = Math.floor(diffs.length / 2);
  var med = diffs[mid];

  var totalLum = 0;
  var step = 20;
  var samples = 0;
  for (var y = 0; y < imgHeight; y += step) {
    for (var x = 0; x < imgWidth; x += step) {
      var i = (y * imgWidth + x) * 4;
      totalLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      samples++;
    }
  }
  var avgLum = totalLum / samples;
  var waterIsBright = avgLum < 150;

  return {
    r: waterIsBright ? 220 : 60,
    g: waterIsBright ? 220 : 60,
    b: waterIsBright ? 220 : 60,
    alpha: Math.min(0.35, Math.max(0.05, (med.dr + med.dg + med.db) / (3 * 255)))
  };
}

function avgPatch(data, imgWidth, x0, y0, size) {
  var sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (var y = y0; y < y0 + size; y++) {
    for (var x = x0; x < x0 + size; x++) {
      var i = (y * imgWidth + x) * 4;
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
      n++;
    }
  }
  return { r: sumR / n, g: sumG / n, b: sumB / n };
}

/**
 * 平铺水印去除 —— 直接修改 imageData
 */
function removeTiledWatermark(imageData, waterColor, waterAlpha) {
  var data = imageData.data;
  var len = data.length;
  var factor = 1 - waterAlpha;

  if (factor < 0.001) {
    for (var i = 0; i < len; i += 4) {
      data[i] = waterColor.r;
      data[i + 1] = waterColor.g;
      data[i + 2] = waterColor.b;
    }
    return imageData;
  }

  for (var i = 0; i < len; i += 4) {
    data[i] = clamp(Math.round((data[i] - waterAlpha * waterColor.r) / factor));
    data[i + 1] = clamp(Math.round((data[i + 1] - waterAlpha * waterColor.g) / factor));
    data[i + 2] = clamp(Math.round((data[i + 2] - waterAlpha * waterColor.b) / factor));
  }

  return imageData;
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

module.exports = {
  detectCornerWatermarks: detectCornerWatermarks,
  fillWatermarkRegion: fillWatermarkRegion,
  autoEstimateTiledWatermark: autoEstimateTiledWatermark,
  removeTiledWatermark: removeTiledWatermark
};
