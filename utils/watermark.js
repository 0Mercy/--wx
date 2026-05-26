/**
 * 水印去除核心算法
 */

/**
 * 自动检测四角水印区域
 * 基于边缘密度检测：水印（logo/文字）区域边缘密度显著高于纯背景
 * @param {ImageData} imageData
 * @param {number} w - 图片宽度
 * @param {number} h - 图片高度
 * @returns {Array<{x, y, w, h}>} 检测到的水印区域列表
 */
function detectCornerWatermarks(imageData, w, h) {
  const cornerRatio = 0.22; // 每个角落扫描 22% 的区域
  const results = [];

  const corners = [
    { name: 'top-left',     x0: 0, y0: 0 },
    { name: 'top-right',    x0: Math.floor(w * (1 - cornerRatio)), y0: 0 },
    { name: 'bottom-left',  x0: 0, y0: Math.floor(h * (1 - cornerRatio)) },
    { name: 'bottom-right', x0: Math.floor(w * (1 - cornerRatio)), y0: Math.floor(h * (1 - cornerRatio)) }
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

/**
 * 在指定矩形区域内检测水印边缘
 * 使用 Sobel 算子计算梯度，聚类高梯度像素，返回水印包围盒
 */
function detectWatermarkInRegion(imageData, imgW, imgH, rx, ry, rw, rh) {
  const data = imageData.data;
  const edgeMap = new Float32Array(rw * rh);
  let maxEdge = 0;

  // Sobel 梯度计算（灰度）
  for (let y = ry + 1; y < ry + rh - 1; y++) {
    for (let x = rx + 1; x < rx + rw - 1; x++) {
      const gx = gray(data, (y - 1) * imgW + (x + 1)) - gray(data, (y - 1) * imgW + (x - 1))
               + 2 * gray(data, y * imgW + (x + 1)) - 2 * gray(data, y * imgW + (x - 1))
               + gray(data, (y + 1) * imgW + (x + 1)) - gray(data, (y + 1) * imgW + (x - 1));
      const gy = gray(data, (y - 1) * imgW + (x - 1)) - gray(data, (y + 1) * imgW + (x - 1))
               + 2 * gray(data, (y - 1) * imgW + x) - 2 * gray(data, (y + 1) * imgW + x)
               + gray(data, (y - 1) * imgW + (x + 1)) - gray(data, (y + 1) * imgW + (x + 1));
      const mag = Math.sqrt(gx * gx + gy * gy);
      const idx = (y - ry) * rw + (x - rx);
      edgeMap[idx] = mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }

  if (maxEdge < 20) return null; // 没有明显边缘，该角无水印

  // 阈值：保留 top 40% 强度的边缘像素
  const threshold = maxEdge * 0.4;
  let minX = rw, minY = rh, maxX = 0, maxY = 0;
  let edgeCount = 0;

  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] >= threshold) {
      const ex = (i % rw);
      const ey = Math.floor(i / rw);
      if (ex < minX) minX = ex;
      if (ex > maxX) maxX = ex;
      if (ey < minY) minY = ey;
      if (ey > maxY) maxY = ey;
      edgeCount++;
    }
  }

  if (edgeCount < 30) return null; // 边缘像素太少，忽略

  // 扩展边距确保覆盖完整水印
  const padding = 8;
  const region = {
    x: Math.max(rx, rx + minX - padding),
    y: Math.max(ry, ry + minY - padding),
    w: Math.min(rw, maxX - minX + padding * 2),
    h: Math.min(rh, maxY - minY + padding * 2)
  };
  return region;
}

function gray(data, idx) {
  const i = idx * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

/**
 * 用周围像素填充水印区域
 */
function fillWatermarkRegion(imageData, imgWidth, imgHeight, region) {
  const { x: rx, y: ry, w: rw, h: rh } = region;
  const data = new Uint8ClampedArray(imageData.data);
  const borderPixels = [];

  // 收集区域边界外侧的像素
  for (let col = rx; col < rx + rw && col < imgWidth; col++) {
    const sy = Math.max(0, ry - 1);
    const idx = (sy * imgWidth + Math.min(col, imgWidth - 1)) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  for (let col = rx; col < rx + rw && col < imgWidth; col++) {
    const sy = Math.min(imgHeight - 1, ry + rh);
    const idx = (sy * imgWidth + Math.min(col, imgWidth - 1)) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  for (let row = ry; row < ry + rh && row < imgHeight; row++) {
    const sx = Math.max(0, rx - 1);
    const idx = (Math.min(row, imgHeight - 1) * imgWidth + sx) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }
  for (let row = ry; row < ry + rh && row < imgHeight; row++) {
    const sx = Math.min(imgWidth - 1, rx + rw);
    const idx = (Math.min(row, imgHeight - 1) * imgWidth + sx) * 4;
    borderPixels.push([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]);
  }

  if (borderPixels.length === 0) return new ImageData(data, imgWidth, imgHeight);

  // 背景是否接近纯色
  let sumR = 0, sumG = 0, sumB = 0;
  borderPixels.forEach(p => { sumR += p[0]; sumG += p[1]; sumB += p[2]; });
  const avg = [sumR / borderPixels.length, sumG / borderPixels.length, sumB / borderPixels.length];

  let variance = 0;
  borderPixels.forEach(p => {
    variance += (p[0] - avg[0]) ** 2 + (p[1] - avg[1]) ** 2 + (p[2] - avg[2]) ** 2;
  });
  variance /= borderPixels.length;
  const isSolidBg = variance < 400;

  for (let py = ry; py < ry + rh && py < imgHeight; py++) {
    for (let px = rx; px < rx + rw && px < imgWidth; px++) {
      const idx = (py * imgWidth + px) * 4;
      if (isSolidBg) {
        data[idx] = avg[0];
        data[idx + 1] = avg[1];
        data[idx + 2] = avg[2];
        data[idx + 3] = 255;
      } else {
        // 用对角线上最近的边界像素
        let distToTop = py - ry;
        let distToBottom = ry + rh - py;
        let distToLeft = px - rx;
        let distToRight = rx + rw - px;
        const nearest = pickNearestBorder(borderPixels, rx, ry, rw, rh, px, py);
        if (nearest) {
          data[idx] = nearest[0];
          data[idx + 1] = nearest[1];
          data[idx + 2] = nearest[2];
          data[idx + 3] = nearest[3];
        }
      }
    }
  }

  return new ImageData(data, imgWidth, imgHeight);
}

function pickNearestBorder(borderPixels, rx, ry, rw, rh, px, py) {
  // 判断像素离哪条边最近，选该边上对应的边界像素
  const dTop = py - ry;
  const dBottom = ry + rh - py;
  const dLeft = px - rx;
  const dRight = rx + rw - px;
  const minD = Math.min(dTop, dBottom, dLeft, dRight);

  // 用该边的像素均值（从 borderPixels 里对应段取）
  let startIdx, endIdx;
  if (minD === dTop)      { startIdx = 0; endIdx = rw; }
  else if (minD === dBottom) { startIdx = rw; endIdx = rw * 2; }
  else if (minD === dLeft)   { startIdx = rw * 2; endIdx = rw * 2 + rh; }
  else                     { startIdx = rw * 2 + rh; endIdx = rw * 2 + rh * 2; }

  let sumR = 0, sumG = 0, sumB = 0, sumA = 0, n = 0;
  for (let i = startIdx; i < endIdx && i < borderPixels.length; i++) {
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
 * 采样多对小块，通过色差分析估计水印颜色和透明度
 */
function autoEstimateTiledWatermark(imageData, imgWidth, imgHeight) {
  const data = imageData.data;
  const patchSize = 32;
  const numPatches = 20;

  // 随机采样小块对
  const pairs = [];
  for (let i = 0; i < numPatches; i++) {
    const x1 = Math.floor(Math.random() * (imgWidth - patchSize));
    const y1 = Math.floor(Math.random() * (imgHeight - patchSize));
    const x2 = Math.floor(Math.random() * (imgWidth - patchSize));
    const y2 = Math.floor(Math.random() * (imgHeight - patchSize));
    pairs.push({ x1, y1, x2, y2 });
  }

  // 收集每对 patch 的颜色差异
  const diffs = [];
  for (const pair of pairs) {
    const avg1 = avgPatch(data, imgWidth, pair.x1, pair.y1, patchSize);
    const avg2 = avgPatch(data, imgWidth, pair.x2, pair.y2, patchSize);
    const diff = Math.abs(avg1.r - avg2.r) + Math.abs(avg1.g - avg2.g) + Math.abs(avg1.b - avg2.b);
    // 如果两 patch 视觉接近（可能是相同背景），它们之间的微小差异 = 水印造成的
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

  // 统计差异中位数作为水印颜色估计，alpha 从差异幅度估计
  const mid = Math.floor(diffs.length / 2);
  diffs.sort((a, b) => (a.dr + a.dg + a.db) - (b.dr + b.dg + b.db));
  const med = diffs[mid];

  // 计算全图平均亮度，判断水印是偏亮还是偏暗
  let totalLum = 0;
  const step = 20;
  let samples = 0;
  for (let y = 0; y < imgHeight; y += step) {
    for (let x = 0; x < imgWidth; x += step) {
      const i = (y * imgWidth + x) * 4;
      totalLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      samples++;
    }
  }
  const avgLum = totalLum / samples;
  // 暗背景上的水印通常偏亮（WPS 水印多为白色半透明），亮背景上的水印偏暗
  const waterIsBright = avgLum < 150;

  return {
    r: waterIsBright ? 220 : 60,
    g: waterIsBright ? 220 : 60,
    b: waterIsBright ? 220 : 60,
    alpha: Math.min(0.35, Math.max(0.05, (med.dr + med.dg + med.db) / (3 * 255)))
  };
}

function avgPatch(data, imgWidth, x0, y0, size) {
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * imgWidth + x) * 4;
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
      n++;
    }
  }
  return { r: sumR / n, g: sumG / n, b: sumB / n };
}

/**
 * 平铺水印去除 - Alpha 混合逆运算
 */
function removeTiledWatermark(imageData, waterColor, waterAlpha) {
  const data = new Uint8ClampedArray(imageData.data);
  const len = data.length;
  const factor = 1 - waterAlpha;

  if (factor < 0.001) {
    for (let i = 0; i < len; i += 4) {
      data[i] = waterColor.r;
      data[i + 1] = waterColor.g;
      data[i + 2] = waterColor.b;
    }
    return new ImageData(data, imageData.width, imageData.height);
  }

  for (let i = 0; i < len; i += 4) {
    data[i] = clamp(Math.round((data[i] - waterAlpha * waterColor.r) / factor));
    data[i + 1] = clamp(Math.round((data[i + 1] - waterAlpha * waterColor.g) / factor));
    data[i + 2] = clamp(Math.round((data[i + 2] - waterAlpha * waterColor.b) / factor));
  }

  return new ImageData(data, imageData.width, imageData.height);
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

module.exports = {
  detectCornerWatermarks,
  fillWatermarkRegion,
  autoEstimateTiledWatermark,
  removeTiledWatermark
};
