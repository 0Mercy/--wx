/**
 * 图片工具函数
 */

const MAX_SHORT_EDGE = 1080;

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

function getCompressedSize(origWidth, origHeight) {
  let w = origWidth;
  let h = origHeight;
  const shortEdge = Math.min(w, h);

  if (shortEdge > MAX_SHORT_EDGE) {
    const ratio = MAX_SHORT_EDGE / shortEdge;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  return { width: w, height: h };
}

/**
 * Canvas 导出为临时文件路径
 */
function canvasToTempFilePath(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      success: res => resolve(res.tempFilePath),
      fail: reject
    });
  });
}

module.exports = {
  MAX_SHORT_EDGE,
  getImageInfo,
  getCompressedSize,
  canvasToTempFilePath
};
