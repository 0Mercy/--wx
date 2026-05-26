const watermark = require('../../utils/watermark');
const storage = require('../../utils/storage');

Page({
  data: {
    displaySrc: '',
    step: 'idle',
    comparing: false,
    tiledAlpha: 18,
    canUndo: false,
    canRedo: false
  },

  onLoad(options) {
    this._src = decodeURIComponent(options.src || '');
    this._canvasWidth = 0;
    this._canvasHeight = 0;
    this._history = [];    // 历史 temp 文件路径
    this._redoFiles = [];  // 重做 temp 文件路径
    this._tiledWaterColor = null;
    this._processing = false;
  },

  onReady() {
    // image 组件直接展示原图
    this.setData({ displaySrc: this._src });
    // 延迟初始化工作 canvas
    setTimeout(() => this.initWorkCanvas(), 200);
  },

  // ---------- 工作 Canvas（隐藏，仅处理用） ----------

  initWorkCanvas() {
    wx.createSelectorQuery()
      .select('#workCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.error('workCanvas not found');
          return;
        }
        this._canvas = res[0].node;
        this._ctx = this._canvas.getContext('2d');
      });
  },

  /**
   * 把当前 displaySrc 加载到工作 Canvas
   */
  loadToCanvas() {
    if (!this._canvas || !this._ctx) {
      return Promise.reject(new Error('Canvas not ready'));
    }
    const src = this.data.displaySrc;
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          const w = info.width;
          const h = info.height;
          this._canvas.width = w;
          this._canvas.height = h;
          this._canvasWidth = w;
          this._canvasHeight = h;

          const img = this._canvas.createImage();
          img.onload = () => {
            this._ctx.drawImage(img, 0, 0, w, h);
            resolve({ width: w, height: h });
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = info.path;
        },
        fail: reject
      });
    });
  },

  /**
   * 工作 Canvas 导出为 temp 文件
   */
  exportCanvas() {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this._canvas,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
  },

  // ---------- 触摸事件 ----------

  onTouchStart() {
    this._preCompareSrc = this.data.displaySrc;
    this._longPressTimer = setTimeout(() => {
      this.setData({ comparing: true, displaySrc: this._src });
    }, 500);
  },

  onTouchEnd() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    if (this.data.comparing) {
      this.setData({ comparing: false, displaySrc: this._preCompareSrc });
    }
  },

  // ---------- 角标水印 ----------

  removeCorner() {
    if (this._processing) return;
    this._processing = true;
    wx.showLoading({ title: '检测角标...' });

    this.loadToCanvas().then(() => {
      const imageData = this._ctx.getImageData(0, 0, this._canvasWidth, this._canvasHeight);
      const regions = watermark.detectCornerWatermarks(imageData, this._canvasWidth, this._canvasHeight);

      if (regions.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '未检测到角标水印', icon: 'none' });
        this._processing = false;
        return;
      }

      let result = imageData;
      for (const r of regions) {
        result = watermark.fillWatermarkRegion(result, this._canvasWidth, this._canvasHeight, r);
      }
      this._ctx.putImageData(result, 0, 0);

      return this.exportCanvas().then(tempPath => {
        this.pushHistory(tempPath);
        wx.hideLoading();
        wx.showToast({ title: `已去除 ${regions.length} 处角标`, icon: 'success' });
      });
    }).catch(e => {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: '处理失败', icon: 'none' });
    }).finally(() => {
      this._processing = false;
    });
  },

  // ---------- 平铺水印 ----------

  removeTiled() {
    if (this._processing) return;
    this._processing = true;
    wx.showLoading({ title: '分析水印...' });

    this.loadToCanvas().then(() => {
      const imageData = this._ctx.getImageData(0, 0, this._canvasWidth, this._canvasHeight);
      const params = watermark.autoEstimateTiledWatermark(imageData, this._canvasWidth, this._canvasHeight);

      wx.hideLoading();

      if (params.alpha < 0.03) {
        wx.showToast({ title: '未检测到明显平铺水印', icon: 'none' });
        this._processing = false;
        return;
      }

      this._tiledWaterColor = params;
      this.setData({ step: 'adjust', tiledAlpha: Math.round(params.alpha * 100) });
      this._processing = false;
    }).catch(e => {
      wx.hideLoading();
      console.error(e);
      this._processing = false;
    });
  },

  onAlphaChange(e) {
    this.setData({ tiledAlpha: e.detail.value });
  },

  applyTiled() {
    if (!this._tiledWaterColor) return;

    // 重新加载 canvas（因为用户可能在 adjust 期间撤销过）
    this.loadToCanvas().then(() => {
      const imageData = this._ctx.getImageData(0, 0, this._canvasWidth, this._canvasHeight);
      const alpha = this.data.tiledAlpha / 100;
      const result = watermark.removeTiledWatermark(imageData, this._tiledWaterColor, alpha);
      this._ctx.putImageData(result, 0, 0);

      return this.exportCanvas().then(tempPath => {
        this.pushHistory(tempPath);
        this.setData({ step: 'idle' });
        this._tiledWaterColor = null;
        wx.showToast({ title: '已处理', icon: 'success' });
      });
    }).catch(e => {
      console.error(e);
      wx.showToast({ title: '处理失败', icon: 'none' });
    });
  },

  cancelTiled() {
    this.setData({ step: 'idle' });
    this._tiledWaterColor = null;
  },

  // ---------- 历史管理 ----------

  pushHistory(newPath) {
    const current = this.data.displaySrc;
    // 不要把原始路径放进历史（原图不删）
    this._history.push(current);
    this._redoFiles = [];
    this.setData({
      displaySrc: newPath,
      canUndo: true,
      canRedo: false
    });
  },

  undo() {
    if (this._history.length === 0) return;
    const current = this.data.displaySrc;
    this._redoFiles.push(current);
    const prev = this._history.pop();
    this.setData({
      displaySrc: prev,
      canUndo: this._history.length > 0,
      canRedo: true
    });
  },

  redo() {
    if (this._redoFiles.length === 0) return;
    const current = this.data.displaySrc;
    this._history.push(current);
    const next = this._redoFiles.pop();
    this.setData({
      displaySrc: next,
      canUndo: true,
      canRedo: this._redoFiles.length > 0
    });
  },

  // ---------- 保存 ----------

  saveImage() {
    const src = this.data.displaySrc;
    wx.showLoading({ title: '保存中...' });
    wx.saveImageToPhotosAlbum({
      filePath: src,
      success: () => {
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
        const now = new Date();
        storage.addHistory({
          id: Date.now().toString(),
          originalPath: this._src,
          thumbPath: src,
          date: `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
          mode: 'auto'
        });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要授权',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  }
});
