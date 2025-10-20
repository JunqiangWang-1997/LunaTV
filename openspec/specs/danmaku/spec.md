# Danmaku Specification

本规范定义了 LunaTV 中与弹幕相关的功能与行为，作为当前已实现能力的单一事实来源。

## Requirement: Danmaku Input Auto-Clear

播放器在用户成功发送弹幕后，应自动清空输入框以提升连续发送体验。

#### Scenario: Input cleared on success

- WHEN 用户发送一条弹幕且服务端返回成功
- THEN 输入框 SHALL 被立即清空
- AND 用户可以立刻输入下一条弹幕

#### Scenario: Input preserved on failure

- WHEN 用户发送一条弹幕但服务端返回错误
- THEN 输入框 SHALL 保留原有文本
- AND 允许用户修改后重试

## Requirement: Automatic Danmaku Import

系统在视频加载时应自动查找并导入匹配弹幕，默认优先使用缓存与 Bilibili 数据源，并在失败时自动尝试兜底源。

#### Scenario: Auto-import on video load

- WHEN 用户点击播放某视频/剧集
- AND 本地弹幕集合 `danmaku:{source}:{id}:{episode}` 为空
- THEN 系统 SHALL 自动执行以下流程：
  1. 检查并使用 provider 映射缓存 `danmaku:map:{source}:{id}`（含 seasonId 等）
  2. 若无可用映射或未命中目标集，查询第三方源获取目标集 cid
  3. 按顺序尝试：优先使用缓存的 seasonId 推导 → DanDanPlay 兜底 → Bilibili（WBI 签名搜索 → season 详情 → 提取 cid）
  4. 使用获取到的 cid 拉取弹幕并写入本地集合
- AND 播放不被阻塞，弹幕加载为后台流程

#### Scenario: Auto-import success feedback

- WHEN 自动导入成功
- THEN 播放器显示轻提示（例如：“已自动加载 N 条弹幕”）
- AND 弹幕在不刷新页面的情况下显示

#### Scenario: Auto-import failure with fallbacks

- WHEN Bilibili 路径无法匹配或接口失败
- THEN 系统 SHALL 自动尝试 DanDanPlay 作为兜底
- AND 若所有源均失败，则提示“未找到弹幕，可手动导入”，并记录失败细节用于调试

#### Scenario: Auto-import caching

- WHEN 自动导入成功获取到 seasonId/cid
- THEN 将映射写入 `danmaku:map:{source}:{id}`（含 seasonId 等信息）
- AND 后续同系列集数 SHALL 优先使用缓存避免重复搜索

#### Scenario: Auto-import for series episodes

- WHEN 用户切换到同一剧集的其它集
- AND 已存在可用的 seasonId 缓存
- THEN 系统 SHALL 直接依据 season 详情推导目标集 cid 并导入弹幕
- AND 不再重复执行搜索

## Requirement: Danmaku Sending Feedback

系统在弹幕发送后应提供即时反馈，包括成功提示与失败提示。

#### Scenario: Success notification

- WHEN 弹幕成功发送到服务器
- THEN 显示“弹幕发送成功”等成功提示
- AND 自动清空输入框
- AND 立即将该弹幕渲染到播放器

#### Scenario: Failure notification

- WHEN 弹幕发送失败
- THEN 显示“弹幕发送失败”等错误提示
- AND 保留输入内容，允许用户重试

## Requirement: Manual Danmaku Import Fallback

当自动导入失败或用户需要手动控制来源时，应提供手动导入能力。

#### Scenario: Manual import remains available

- WHEN 自动导入未找到匹配弹幕
- THEN 显示“手动导入弹幕”入口
- AND 保留单集导入能力

#### Scenario: Manual import for custom sources

- WHEN 用户希望从特定来源导入（如指定 Bilibili cid）
- THEN 允许手动选择来源与外部 ID（Bilibili/DanDanPlay，cid/episodeId）
- AND 仅对当前集生效
- AND 可覆盖自动导入结果
