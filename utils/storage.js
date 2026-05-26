/**
 * 历史记录本地存储
 */

const HISTORY_KEY = 'watermark_history';
const MAX_HISTORY = 20;

function getHistory() {
  try {
    return wx.getStorageSync(HISTORY_KEY) || [];
  } catch (e) {
    return [];
  }
}

function addHistory(item) {
  const list = getHistory();
  // 去重（按 originalPath）
  const idx = list.findIndex(h => h.originalPath === item.originalPath);
  if (idx >= 0) {
    list.splice(idx, 1);
  }
  list.unshift(item);
  if (list.length > MAX_HISTORY) {
    list.pop();
  }
  wx.setStorageSync(HISTORY_KEY, list);
  return list;
}

function removeHistory(id) {
  const list = getHistory().filter(h => h.id !== id);
  wx.setStorageSync(HISTORY_KEY, list);
  return list;
}

function clearHistory() {
  wx.setStorageSync(HISTORY_KEY, []);
  return [];
}

module.exports = {
  getHistory,
  addHistory,
  removeHistory,
  clearHistory
};
