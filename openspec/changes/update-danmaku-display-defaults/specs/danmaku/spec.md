## ADDED Requirements

### Requirement: Default Danmaku Display Settings

播放器 SHALL 设定统一的弹幕默认显示参数，以提供一致的初始观看体验。

#### Scenario: Defaults applied on player init

- WHEN 播放器初始化并启用弹幕
- THEN 默认参数 SHALL 为：
  - 不透明度：66%
  - 显示区域：50%（半屏）
  - 字号：25px
  - 速度：较慢（低于标准档）
  - 同步视频速度：开启（跟随倍速）
- AND 用户可在会话中临时调整；刷新后恢复默认
