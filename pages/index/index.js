const storage = require('../../utils/storage');
const imageUtil = require('../../utils/image');

Page({
  data: {
    history: []
  },

  onShow() {
    this.setData({ history: storage.getHistory() });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        // 生成缩略图用于历史展示
        this.compressAndNavigate(tempPath);
      }
    });
  },

  compressAndNavigate(src) {
    imageUtil.getImageInfo(src).then(info => {
      const size = imageUtil.getCompressedSize(info.width, info.height);
      // 直接进入编辑页
      wx.navigateTo({
        url: `/pages/edit/edit?src=${encodeURIComponent(src)}&width=${size.width}&height=${size.height}`
      });
    }).catch(() => {
      wx.navigateTo({
        url: `/pages/edit/edit?src=${encodeURIComponent(src)}`
      });
    });
  },

  openHistory(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/edit/edit?src=${encodeURIComponent(item.originalPath)}&fromHistory=1`
    });
  },

  deleteHistory(e) {
    const id = e.currentTarget.dataset.id;
    const list = storage.removeHistory(id);
    this.setData({ history: list });
  },

  clearHistory() {
    wx.showModal({
      title: '清空记录',
      content: '确定要清空所有处理记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: storage.clearHistory() });
        }
      }
    });
  }
});
