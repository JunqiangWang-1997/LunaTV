## Context

目标：为播放器设置统一的弹幕默认显示参数，减少用户每次手动调整的成本；这些默认值不影响用户临时改动（刷新后恢复默认）。

## Defaults (Recommended)

- Opacity: 0.66（66%）
- Area: 0.5（半屏覆盖比例）
- Font Size: 25px
- Speed: Slow（较慢档，低于标准/默认速度）
- Follow Playback Speed: On（跟随倍速播放）

实现时对应到 ArtPlayer + 弹幕插件的初始化 options（字段名以插件文档为准，示例语义映射）：

- opacity ≈ 0.66
- area/visibleArea/heightRatio ≈ 0.5
- fontSize ≈ 25
- speed/speedLevel ≈ 'slow' 或一个低于默认的数值
- followPlaybackSpeed/synchronousSpeed ≈ true

注意：不同插件版本字段命名可能不同，请以实际依赖版本的文档为准；如字段不存在，选择最接近的可替代配置。

## Validation Plan

1. 打开任意视频：确认初始即为上述默认值
2. 切换 1.5x/2x 倍速：确认弹幕速度随视频速度变化
3. 临时在 UI 中修改参数并刷新：确认恢复默认值
