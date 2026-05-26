# 微信小程序 — 图片去水印工具 计划书

## 需求摘要

- **水印类型**：角标/文字水印（如豆包 AI 右下角 logo）+ 全图平铺水印（如 WPS 斜铺水印）
- **架构**：纯客户端（微信小程序 Canvas API），无服务器
- **用户**：自己和朋友先用，后期考虑上架

## 技术可行性分析

### 可行方案

**角标水印去除** — 可行，Canvas API 完全够用：
- 用户框选水印区域后，用相邻像素填充/裁剪
- 对于纯色背景，用背景色直接覆盖
- 对于复杂背景，用周围像素做简单 inpainting（取水印边界像素均值渐变填充）

**半透明平铺水印去除** — 部分可行，基于 Alpha 混合逆运算：
- 水印本质：`result = watermark_alpha × watermark_color + (1-watermark_alpha) × original`
- 如果用户能标记一个水印样本区域和一段干净背景，可估算 watermark_color 和 alpha
- 然后对全图做逆向还原：`original = (result - watermark_alpha × watermark_color) / (1-watermark_alpha)`
- 局限：需要水印颜色/透明度是均匀的，复杂水印效果有限

### 局限性（需向用户说明）

- 对于多层渐变、非半透明、色调复杂的专业水印，纯客户端处理效果有限
- 处理全图平铺水印需要用户手工标记水印样本，无法做到一键自动去除
- 图片分辨率较大时（>4000px），Canvas 可能有内存限制

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | 微信小程序原生框架（WXML + WXSS + JS） |
| 图片处理 | Canvas 2D API（`wx.createCanvasContext` / `wx.createOffscreenCanvas`） |
| 图片选择 | `wx.chooseMedia` / `wx.chooseImage` |
| 图片保存 | `wx.saveImageToPhotosAlbum` |
| 手势交互 | `movable-area` / `movable-view` 实现框选 |
| 状态管理 | 页面级 data + 工具模块 |

## 项目结构

```
qushuiyin_wx/
├── app.js                          # 小程序入口
├── app.json                        # 全局配置
├── app.wxss                        # 全局样式
├── project.config.json             # 项目配置
├── sitemap.json                    # 搜索配置
├── pages/
│   ├── index/                      # 首页：图片上传 & 历史记录
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── edit/                       # 编辑页：水印去除核心功能
│       ├── edit.js
│       ├── edit.json
│       ├── edit.wxml
│       └── edit.wxss
├── utils/
│   ├── watermark.js                # 水印去除核心算法
│   ├── image.js                    # 图片工具函数（压缩、格式转换）
│   └── storage.js                  # 历史记录本地存储
└── components/
    └── toolbar/                    # 工具栏组件（撤销/重做/保存）
        ├── toolbar.js
        ├── toolbar.json
        ├── toolbar.wxml
        └── toolbar.wxss
```

## 功能模块

### 模块 1：图片导入（首页）

- 从相册/相机选择图片
- 大图自动压缩至合理尺寸（短边 ≤ 1080px）
- 以卡片形式展示历史处理记录
- 点击历史记录可重新编辑

### 模块 2：角标水印去除（编辑页 — 模式 A）

- 用户用手指在图片上拖动，框选水印所在区域
- 提供两种去除策略：
  - **裁剪**：直接裁掉水印所在边角（适合水印在边缘）
  - **填充**：用水印区域周围的像素颜色做渐变填充（适合水印在内容区）
- 实时预览效果

### 模块 3：平铺水印去除（编辑页 — 模式 B）

- 用户用两个框分别标记：
  - 框 1：一个水印样本（只含水印不含重要内容）
  - 框 2：一段干净背景（不含水印的纯背景区域）
- 算法根据两个样本估算水印颜色和透明度
- 对全图做 Alpha 混合逆向还原
- 可调参数：透明度强度滑块

### 模块 4：辅助功能

- 撤销/重做（最多 10 步）
- 对比原图（长按显示原图）
- 保存到相册（需要用户授权）
- 分享给朋友

## 核心算法设计

### 角标填充算法（`utils/watermark.js`）

```
fillWatermarkRegion(imageData, region) {
  1. 取 region 边界外一圈像素
  2. 对 region 内每个像素，用距离最近的边界像素颜色填充
  3. 对于纯色背景场景，可先检测背景是否接近纯色，是则直接用均值填充
}
```

### 平铺水印逆运算（`utils/watermark.js`）

```
removeTiledWatermark(imageData, watermarkSample, cleanSample) {
  1. 从 watermarkSample 和 cleanSample 估算 water_alpha 和 water_color
  2. 遍历全图每个像素，应用公式：
     original = clamp((result - water_alpha * water_color) / (1 - water_alpha), 0, 255)
  3. 使用 OffscreenCanvas 加速处理
}
```

## 交互流程

```
首页（选择图片）
  │
  ▼
编辑页（显示图片 + 工具栏）
  │
  ├─ [角标水印模式] → 拖拽框选水印 → 选择"裁剪"或"填充" → 预览 → 确认
  │
  └─ [平铺水印模式] → 标记水印样本 → 标记干净背景 → 调整强度 → 预览 → 确认
  │
  ▼
保存到相册 / 分享
```

## 实施计划

| 步骤 | 任务 | 预计工作量 |
|------|------|-----------|
| 1 | 初始化小程序项目结构，配置 app.json | 小 |
| 2 | 实现首页（图片选择 + 历史记录列表） | 中 |
| 3 | 实现编辑页基础框架（图片展示 + 底部工具栏） | 中 |
| 4 | 实现角标水印去除（框选交互 + 填充/裁剪算法） | 中 |
| 5 | 实现平铺水印去除（双区域标记 + Alpha 逆运算） | 大 |
| 6 | 实现撤销/重做、原图对比 | 小 |
| 7 | 实现保存与分享 | 小 |
| 8 | 测试与调优 | 中 |

## 技术风险与降级方案

| 风险 | 降级方案 |
|------|---------|
| 平铺水印去除效果不佳 | 优先保证角标去除体验，平铺模式标注为"实验性" |
| 大图内存溢出 | 导入时自动压缩至短边 1080px |
| OffscreenCanvas 兼容性 | 降级为普通 Canvas（基础库 2.16.0+ 才支持 OffscreenCanvas） |

## 验证方式

1. 准备带豆包 AI 水印的截图 → 用角标模式去除 → 检查边缘是否干净
2. 准备带 WPS 水印的文档截图 → 分别用角标和平铺模式处理 → 对比效果
3. 测试大图（>10MB）是否正常压缩处理
4. 测试撤销/重做是否完整保留操作历史
