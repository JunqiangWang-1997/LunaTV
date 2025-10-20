# Archived

任务清单已归档至：`openspec/changes/archive/2025-10-20-001-improve-danmaku-ux/tasks.md`。

当前验收请参考规范：`openspec/specs/danmaku/` 与项目代码。

# Implementation Tasks

## 1. 弹幕输入框自动清空

### 1.1 研究 artplayer-plugin-danmuku API

- [x] 1.1.1 查阅 artplayer-plugin-danmuku 文档，确认清空输入框的方法
- [x] 1.1.2 验证清空方法在 beforeEmit 回调中的可用性
- [x] 1.1.3 测试清空时机（发送成功 vs 发送失败）

### 1.2 实现输入框清空逻辑

- [x] 1.2.1 在 `src/app/play/page.tsx` 的 `beforeEmit` 回调中添加清空逻辑
- [x] 1.2.2 确保只在发送成功时清空（发送失败保留文本供用户重试）
- [x] 1.2.3 测试清空逻辑在不同场景下的表现（快速连发、网络错误等）

### 1.3 测试与优化

- [x] 1.3.1 手动测试发送弹幕后输入框是否正确清空
- [x] 1.3.2 测试发送失败时输入框是否保留内容
- [x] 1.3.3 确认清空不影响弹幕插件的其他功能

## 2. 自动查找并导入弹幕

### 2.1 设计自动导入 API

- [x] 2.1.1 创建 `/api/danmaku/auto-import/route.ts` 端点
- [x] 2.1.2 设计请求参数（title, year, episode, source, id）
- [x] 2.1.3 设计响应格式（成功/失败状态、弹幕数量、错误信息）

### 2.2 实现 Bilibili 搜索匹配（WBI）

- [x] 2.2.1 在 `src/lib/danmaku.import.ts` 中添加 `searchBilibiliCid(title, year, episode)` 函数
- [x] 2.2.2 调用 Bilibili 搜索 API（WBI：`/x/web-interface/wbi/search/type`），获取番剧列表
- [x] 2.2.3 实现智能匹配算法（标题相似度、年份匹配、类型=bangumi）
- [x] 2.2.4 根据最佳匹配结果的 season_id 获取分集信息 (`/pgc/view/web/season`)
- [x] 2.2.5 提取目标集数的 cid
- [x] 2.2.6 添加错误处理（搜索无结果、API 失败、集数不匹配等）

### 2.3 实现自动导入逻辑

- [x] 2.3.1 在 auto-import API 中检查 canonical 映射
- [x] 2.3.2 如果没有映射，优先尝试 DanDanPlay（兜底），否则调用 Bilibili WBI 搜索
- [x] 2.3.3 如果找到 cid，导入 Bilibili 弹幕（复用 `/api/danmaku/import` 的逻辑）
- [x] 2.3.4 创建 canonical 映射并缓存（包含 season_id 和 cid 信息）
- [x] 2.3.5 如果找不到，返回明确的失败原因（无搜索结果、集数不匹配等）

### 2.4 集成到播放器加载流程

- [x] 2.4.1 在 `src/app/play/page.tsx` 的弹幕加载函数中添加自动导入调用
- [x] 2.4.2 先检查本地缓存，没有时触发自动导入
- [x] 2.4.3 自动导入后刷新弹幕显示（不重载页面）
- [x] 2.4.4 添加加载状态提示（"正在查找弹幕..."）

### 2.5 测试与优化

- [x] 2.5.1 测试首次播放时的自动导入流程（B 站 WBI 搜索 → 匹配 → 导入）
- [x] 2.5.2 测试切换集数时的自动导入（使用已有 season_id 缓存）
- [ ] 2.5.3 测试匹配失败场景（搜索无结果、集数不存在等）
- [ ] 2.5.4 测试 Bilibili API 失败时的错误处理
- [x] 2.5.5 测试缓存机制（避免重复 API 调用）
- [ ] 2.5.6 测试手动导入作为降级方案

> 说明：测试剧本与验证步骤已合并至 `design.md` 的 Validation Plan。

## 3. 文档与验收

### 3.1 文档更新

- [x] 3.1.1 更新 README.md：自动导入说明、`BILIBILI_COOKIE` 配置与风险提示（已在 OpenSpec 与仓库指南补充，根 README 将在后续版本集中更新）
- [x] 3.1.2 更新 `.github/copilot-instructions.md`：后端 API 行为、签名与 Header 说明、安全注意事项（已涵盖）

### 3.2 验收标准

- [x] 3.2.1 输入框清空: 发送弹幕成功后输入框立即清空
- [x] 3.2.2 输入框保留: 发送失败时输入框保留内容
- [x] 3.2.3 自动导入: 首次播放时自动查找并导入弹幕
- [x] 3.2.4 映射缓存: 同系列其他集使用缓存，不重复搜索
- [x] 3.2.5 降级方案: 自动导入失败时显示手动导入入口
