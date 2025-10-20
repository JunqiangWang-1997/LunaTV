# Archived

本提案已归档至：`openspec/changes/archive/2025-10-20-001-improve-danmaku-ux/`。

当前生效规范请查看：`openspec/specs/danmaku/`。

# Proposal: Improve Danmaku User Experience

## Why

弹幕系统当前存在两个影响用户体验的问题:

1. **输入框不会自动清空**: 用户发送弹幕后，输入框保留已发送内容，影响连续发送体验，需要手动清空才能输入新弹幕
2. **缺少自动弹幕功能**: 用户点击播放视频时，需要手动点击"导入弹幕"并输入第三方 ID（如 Bilibili cid），体验繁琐且门槛高

理想体验应该是：**用户点击播放 → 系统自动查找匹配弹幕 → 静默导入 → 直接显示**，无需任何手动操作。

## What Changes

### 1. 弹幕输入框自动清空

- 在 `src/app/play/page.tsx` 中修改 `beforeEmit` 回调
- 发送成功后调用 artplayer-plugin-danmuku 的清空方法
- 保持错误时不清空输入框（允许用户重试）

### 2. 自动查找并导入弹幕

**核心流程**：

1. 播放器加载时，先尝试从本地缓存加载弹幕（`danmaku:{source}:{id}:{episode}`）
2. 如果没有弹幕，自动触发查找导入流程（优先级顺序）：
   - **第一优先级**：检查 canonical 映射（`danmaku:map:{source}:{id}`）
   - **第二优先级**：通过 Bilibili API 自动搜索番剧 → 匹配集数 → 提取 cid → 导入弹幕
   - **失败处理**：如果 Bilibili 找不到，返回"未找到弹幕"提示
3. 后台静默执行，不阻塞播放器加载
4. 导入完成后自动刷新弹幕显示

**Bilibili 自动查找逻辑**：

- 使用剧名 + 年份搜索 Bilibili 番剧库（`/x/web-interface/search/type` API）
- 智能匹配最佳结果（考虑标题相似度、年份、类型为 bangumi）
- 提取番剧的 season_id，获取分集信息（`/pgc/view/web/season` API）
- 根据集数获取对应的 cid
- 自动导入该 cid 的弹幕并创建 canonical 映射

**实现要点**：

- 新增 `/api/danmaku/auto-import` 端点（Bilibili 搜索和匹配逻辑）
- 在 `src/lib/danmaku.import.ts` 中添加 `searchBilibiliCid(title, year, episode)` 函数
- 在 `src/app/play/page.tsx` 的弹幕加载流程中集成自动导入
- 保留手动导入入口作为降级方案（当自动查找失败时）
- 添加缓存机制（canonical 映射），避免重复查找

### 3. 反爬虫与可靠性（新增）

为降低 Bilibili 接口 412/401 风险，本次实现加入以下措施：

- 接入 WBI 签名：对搜索接口参数进行 w_rid/wts 签名，改用 `x/web-interface/wbi/search/type`
- 统一请求头：规范 UA、Referer、Accept、语言与缓存控制
- 可选 Cookie：支持通过环境变量 `BILIBILI_COOKIE` 注入登录态（如 SESSDATA、buvid3/4 等），在自有环境下显著降低 412 概率

安全说明：

- `BILIBILI_COOKIE` 仅在本地/自建服务器配置，严禁提交到仓库
- Cookie 有有效期，需定期替换；更换账号/登录状态后需更新

### 4. 自动导入优先级与回退（当前实现）

自动导入顺序：

1. 映射缓存：若已有 `seasonId`，直接取目标集 `cid`
2. DanDanPlay 兜底：使用 DDP 搜索并导入（不易触发风控）
3. Bilibili 搜索：使用 WBI 签名搜索 → season 详情 → 提取 `cid`

备注：若需“始终 Bilibili 优先”，可将顺序切为 缓存 → Bilibili(WBI) → DDP，变更较小（仅调整调用顺序）。

## Impact

### Affected Specs

- `specs/danmaku/spec.md` (将新增/修改需求)

### Affected Code

- `src/app/play/page.tsx` (弹幕输入框清空逻辑 + 自动导入集成)
- `src/app/api/danmaku/auto-import/route.ts` (新增: Bilibili 自动搜索和导入端点)
- `src/lib/danmaku.import.ts` (扩展: 添加 `searchBilibiliCid()` 搜索匹配函数)
- `src/components/DanmakuImport.tsx` (保留: 作为手动导入降级方案)

### User Impact

- ✅ 提升弹幕发送体验（无需手动清空）
- ✅ **零操作自动弹幕**（点击播放即自动导入，无需手动查找 cid）
- ✅ 降低使用门槛（不需要了解第三方弹幕源）
- ⚠️ 自动导入可能增加 API 调用（需缓存机制避免重复查找）
- ⚠️ 匹配准确性依赖剧名质量（需要容错机制）

### Breaking Changes

无破坏性变更。功能为向后兼容的增强。
