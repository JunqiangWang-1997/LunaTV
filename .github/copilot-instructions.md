# Copilot / AI Agent 指南 — LunaTV

下面为 AI 编码代理（如 Copilot、自动修复机器人）准备的简洁指引，帮助快速上手并做出可靠改动。

原则性说明

- 只修改项目中已有的文件；避免添加大型新依赖或大幅改造架构。任何新增依赖需先询问。
- 遵循仓库既有风格（TypeScript、ESLint、Prettier、Tailwind）。
- 所有后端代码运行在 Next.js App Router（`src/app/api/**`），默认 runtime 为 `nodejs`。

一眼看懂架构（大图景）

- 前端：Next.js App Router（`src/app`），主要页面 `src/app/play/page.tsx` 使用 Artplayer + Hls.js。
- 后端：Next.js API 路由（`src/app/api`）提供功能性接口，如 `api/danmaku`、`api/detail` 等。
- 存储：抽象 `IStorage`（`src/lib/types.ts`）支持多实现（`upstash.db.ts`、`redis.db.ts`、`kvrocks.db.ts`），通过 `src/lib/db.ts` 暴露 `db` 单例。
- 弹幕（Danmaku）：Sorted Set 存储，键格式 `danmaku:{source}:{id}:{episode}`；导入/共享使用 canonical: `danmaku:canonical:{slug}:{episode}` 和映射 `danmaku:map:{source}:{id}`。

关键文件/目录（先读这些）

- `src/app/play/page.tsx` — 播放器与弹幕集成（动态 import artplayer-plugin-danmuku）
- `src/app/api/danmaku/import/route.ts` — 第三方弹幕导入与 canonical 写入逻辑
- `src/app/api/danmaku/route.ts` — GET/POST 弹幕，包含 canonical 回退
- `src/lib/danmakuImport.ts` — ensure/import 工具函数（包含 Bilibili WBI 签名、统一请求头）
- `src/lib/` — 存储抽象与实现（`db.ts`, `upstash.db.ts`, `redis-base.db.ts` 等）
- `src/components/DanmakuImport.tsx` — 导入 UI（会带上 title/year）

开发与调试要点

- 本地运行（开发模式）：
  - 使用 pnpm：`pnpm install`、`pnpm dev`（Windows PowerShell 环境）
  - 常见错误：若出现 SSR 相关的 artplayer 插件报错，确认没有静态 import `artplayer-plugin-danmuku`；应使用动态 import（仓库已实现）
- 存储类型：由环境变量 `NEXT_PUBLIC_STORAGE_TYPE` 控制（`upstash`/`redis`/`kvrocks`）；Upstash 需要 `UPSTASH_URL` 与 `UPSTASH_TOKEN`。
- Bilibili：若遇 412/401，支持在 `.env.local` 配置 `BILIBILI_COOKIE`，格式为整条 Cookie（SESSDATA, buvid3/4, b_nut 等），重启生效；严禁提交到仓库。
- 清理与 rebuild：遇到构建问题，先清理 `.next`，然后重新安装依赖。

代码风格与约定

- TypeScript 严格模式（尽量避免 any）；仓库中已有 ESLint/Prettier 规则。
- API 路由使用 Zod 做参数校验；请在修改/新增 API 时添加 zod 校验。
- 弹幕时间使用秒为单位（float），Sorted Set 的 score 为 time。
- 站内多数索引为 0-based（后端），UI 显示为 1-based（前端）。

示例：如何添加弹幕导入的增强逻辑

- 修改点：`src/app/api/danmaku/import/route.ts`
- 做法：在导入完成后，写入 `danmaku:canonical:{slug}:{episode}` 与 `danmaku:map:{source}:{id}`（JSON 包含 title/year/slug），已在仓库实现。

安全与外部集成

- DanDanPlay API 需要 AppId/AppSecret（目前仓库保留代码但未启用认证）。
- Bilibili:
  - 搜索走 `x/web-interface/wbi/search/type`（WBI 签名）
  - 详情 `pgc/view/web/season`，弹幕 `x/v1/dm/list.so`
  - 可选 `BILIBILI_COOKIE` 提升成功率（仅本地/自建环境）
- 不要在公开仓库或文档中暴露 Upstash token 或 Redis 密钥。

若需更改或新增行为

- 先在本地跑通 `pnpm dev` 并复现场景
- 小步提交（一项改动对应一个 PR），在 PR 描述中说明动机与影响范围

遇到难题时给 AI 代理的上下文片段（例子）

1. 需要实现弹幕导入后自动归档到 canonical：请读 `src/app/api/danmaku/import/route.ts` 与 `src/lib/danmaku.import.ts`，注意 zadd/zrange API 与 `db` 单例接口；slug 构造位于 `src/lib/danmaku.util.ts`。
2. 播放器弹幕颜色异常：查看 `src/app/api/danmaku/import/route.ts` 中 Bilibili 解析逻辑，颜色参数是 p 参数的第 4 个（索引 3）。

要点速查（快捷参考）

- 弹幕键：`danmaku:{source}:{id}:{episode}`
- canonical：`danmaku:canonical:{slug}:{episode}`
- provider 映射：`danmaku:map:{source}:{id}`（JSON）
- Storage 控制：`NEXT_PUBLIC_STORAGE_TYPE`

如果你需要我把这个文件合并到现有 README 或 AGENT 文档里，或要更加详细的任务模板（如 PR checklist、测试脚本），请告诉我你想要的格式与深度。
