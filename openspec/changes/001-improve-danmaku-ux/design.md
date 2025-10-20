# Archived

设计文档已归档至：`openspec/changes/archive/2025-10-20-001-improve-danmaku-ux/design.md`。

请以 `openspec/specs/danmaku/` 为当前依据。

## Context

改动目标：提升弹幕用户体验，实现“播放即有弹幕”的自动导入能力，并确保在 Bilibili 风控（412/401）场景下仍具备较高成功率与清晰的降级路径。

约束与背景：

- Next.js App Router（Node.js runtime），后端统一通过 `fetch` 调第三方接口
- 存储使用 `IStorage` 抽象（Redis/Upstash/Kvrocks），弹幕以 Sorted Set 存储，score 为秒级时间
- Bilibili 接口存在反爬/风控，未经签名或缺少登录上下文可能返回 412/401

## Goals / Non-Goals

- Goals

  - 播放时自动查找并导入对应集的弹幕
  - 尽量规避 B 站风控，提高成功率
  - 使用 seasonId 缓存，切换集数无需重复搜索
  - 失败时提供明确、可操作的降级方案

- Non-Goals
  - 不引入大型新依赖或复杂抓取框架
  - 不提供公共平台的共享 Cookie 或账号管理

## Decisions

1. WBI 签名的 B 站搜索

- 接口：`/x/web-interface/wbi/search/type`（替代旧的 `/search/type`）
- 做法：通过 `/x/web-interface/nav` 获取 wbi_img 键，计算 mixinKey，对参数进行 wts/w_rid 签名
- 结果：显著降低 412 拦截概率，配合正确 UA/Referer 成功率更高

2. 统一请求头 + 可选 Cookie

- 统一 Headers：UA、Referer、Accept、语言、Cache-Control 等
- 可选 Cookie：通过 `.env.local` 设置 `BILIBILI_COOKIE`（包含 SESSDATA、buvid3/4、b_nut 等）
- 安全要求：仅本地/自建环境使用，严禁入库或提交仓库；Cookie 具有效期需定期更新

3. 自动导入顺序与缓存

- 顺序：优先使用映射缓存 seasonId → DDP 兜底 → B 站 WBI 搜索
- seasonId 缓存：`danmaku:map:{source}:{id}`，减少后续集数的搜索成本
- 弹幕抓取：B 站 XML 接口 `x/v1/dm/list.so?oid={cid}`，解析 `<d>` 节点为 `DanmakuItem`

4. 降级与可操作性

- 自动导入失败时保留手动导入入口（可粘贴 cid）
- 暴露明确的失败原因（not-found/empty/fetch-failed/save-failed 等）

## Risks / Trade-offs

- 风控不确定性：WBI + Headers 已降低 412，但仍可能触发；Cookie 可显著提升稳定性，但带来运维成本（过期、更新）
- 匹配准确性：剧名带修饰（精编版/国语等）可能影响匹配；可后续引入标题归一化与模糊匹配优化

## Validation Plan

环境准备（可选但推荐）：

```
BILIBILI_COOKIE="SESSDATA=...; buvid3=...; buvid4=...; b_nut=..."
```

保存后重启开发服务。

验证用例：

- 首次播放自动导入（WBI 搜索 → 匹配 → 导入，播放器出现弹幕）
- 切换集数使用 seasonId 缓存（日志出现“使用缓存的 season_id”）
- 匹配失败（冷门标题、集数不存在），返回明确提示并保留手动导入
- B 站 API 失败（可通过 Block 域名模拟），不影响播放，仍可手动导入
- 缓存命中：同一剧集不重复搜索；多集场景仅取详情列表

期望日志关键点：

- `x/web-interface/wbi/search/type` 调用成功
- `使用缓存的 season_id` / `从缓存获取 cid`
- `导入 Bilibili 弹幕 (cid: ...)` 与成功条数

## Migration Plan

无数据迁移需求；仅新增/更新 Redis 键：`danmaku:map:{source}:{id}` 与弹幕集合键 `danmaku:{source}:{id}:{episode}`。

## Open Questions

- 是否提供“仅 B 站优先”的可配置开关（跳过 DDP 兜底）？
- 是否加入标题归一化/模糊匹配以提升搜索命中率？
