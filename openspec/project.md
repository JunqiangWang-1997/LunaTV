# Project Context

## Purpose

LunaTV (MoonTV) 是一个开源的跨平台影视聚合播放器，提供多源搜索、在线播放、收藏同步、播放记录、弹幕系统等功能。支持 Docker 部署，适用于个人私有影视管理和观看场景。

**核心目标：**

- 聚合多个视频源，提供统一搜索和播放体验
- 支持弹幕系统（含第三方导入与跨源共享）
- 提供云端存储（Redis/Upstash/Kvrocks）实现播放记录、收藏跨设备同步
- PWA 支持，提供移动端原生体验

## Tech Stack

- **框架：** Next.js 14 (App Router)
- **语言：** TypeScript 4.x (严格模式)
- **样式：** Tailwind CSS 3 + Headless UI
- **播放器：** ArtPlayer 5 + HLS.js 1.6
- **弹幕插件：** artplayer-plugin-danmuku 5.2 (动态导入避免 SSR 问题)
- **存储：** Redis 4 / Upstash Redis / Apache Kvrocks
- **包管理：** pnpm 10.14
- **校验：** Zod 3.24
- **代码质量：** ESLint、Prettier、Husky、lint-staged
- **测试：** Jest 27 + React Testing Library
- **部署：** Docker（仅支持 Docker 部署）

## Project Conventions

### Code Style

- **TypeScript 严格模式**：避免 `any`，优先使用类型推导和明确类型标注
- **格式化：** Prettier 2.8 + Tailwind 插件（自动排序 class）
- **Lint：** ESLint + simple-import-sort（按字母排序 import）
- **命名规范：**
  - 组件文件：PascalCase（如 `DanmakuImport.tsx`）
  - 工具/类型文件：kebab-case（如 `danmaku.util.ts`, `admin.types.ts`）
  - API 路由：`route.ts` 固定命名（Next.js App Router 约定）
- **路径别名：** `@/*` 映射到 `src/*`，`~/*` 映射到 `public/*`

### Architecture Patterns

- **分层架构：**
  - `src/app/` — Next.js App Router 页面和 API 路由（`api/**` 目录）
  - `src/components/` — 可复用 React 组件
  - `src/lib/` — 业务逻辑、工具函数、类型定义、数据库抽象
  - `src/hooks/` — 自定义 React Hooks
  - `src/styles/` — 全局样式和颜色变量
- **存储抽象：** `IStorage` 接口（`src/lib/types.ts`）支持多种后端实现（Upstash/Redis/Kvrocks），通过 `src/lib/db.ts` 暴露 `db` 单例
- **API 路由规范：**
  - 所有 API 使用 Zod 做参数校验
  - 默认 runtime 为 `nodejs`（可按需配置）
  - 错误处理统一返回 `{ error, details }` 结构
- **弹幕系统：**
  - 使用 Redis Sorted Set 存储，键格式：`danmaku:{source}:{id}:{episode}`
  - 支持跨源共享：`danmaku:canonical:{slug}:{episode}` + 映射 `danmaku:map:{source}:{id}`
  - 动态导入插件（避免 SSR 错误）：`await import('artplayer-plugin-danmuku')`

### Testing Strategy

- **单元测试：** Jest + React Testing Library
- **测试命令：** `pnpm test` (运行所有测试), `pnpm test:watch` (watch 模式)
- **类型检查：** `pnpm typecheck` (TypeScript 编译检查，无输出文件)
- **Lint 检查：** `pnpm lint:strict` (max-warnings=0)
- **当前覆盖：** 基础测试配置已就绪，核心功能（弹幕、播放器）需手动测试

### Git Workflow

- **分支策略：** 基于 `main` 分支开发，功能/修复通过 PR 合并
- **Commit 规范：** Commitlint + Conventional Commits
  - 格式：`type(scope): subject`
  - 常用 type：`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- **Pre-commit Hook：** lint-staged 自动格式化和 lint 检查
- **小步提交：** 一项改动对应一个 PR，明确说明动机与影响范围

## Domain Context

- **视频源聚合：** 支持多个符合苹果 CMS V10 API 格式的视频源
- **弹幕导入：** 支持从 Bilibili（需 CID）和 DanDanPlay（需认证）导入第三方弹幕
- **跨源弹幕共享：** 通过 canonical slug（剧名+年份标准化）实现同一剧集不同源弹幕复用
- **索引约定：** 后端使用 0-based 索引，前端 UI 显示 1-based（第 1 集 = index 0）
- **弹幕时间单位：** 秒（浮点数），Sorted Set 的 score 为时间戳

## Important Constraints

- **仅 Docker 部署：** 项目仅支持 Docker 或基于 Docker 的平台部署（不支持传统 Node.js 部署）
- **存储依赖：** 必须配置 Redis/Upstash/Kvrocks 之一（由 `NEXT_PUBLIC_STORAGE_TYPE` 控制）
- **SSR 限制：** 播放器插件（artplayer-plugin-danmuku）必须动态导入，不能静态 import
- **安全要求：** 强烈建议设置 `USERNAME` 和 `PASSWORD` 环境变量，避免公开访问
- **法律约束：** 本项目不在中国大陆地区提供服务，用户需自行承担法律责任
- **无内置源：** 部署后为空壳应用，需要站长自行收集并配置播放源和直播源

## External Dependencies

- **豆瓣 API：** 用于获取影视详情、海报、评分等（支持多种代理模式）
  - 代理类型由 `NEXT_PUBLIC_DOUBAN_PROXY_TYPE` 控制（direct/cors-proxy-zwei/cmliussss-cdn-\*）
- **Bilibili 弹幕 API：** `https://api.bilibili.com/x/v1/dm/list.so?oid={cid}` (XML 格式)
  - 颜色参数位于 `p` 参数第 4 个位置（索引 3）
- **DanDanPlay 弹幕 API：** `https://api.dandanplay.net/api/v2/comment/{episodeId}`
  - 需要 AppId/AppSecret 认证（目前代码保留但未启用）
- **视频源 API：** 符合苹果 CMS V10 格式的 JSON API (`?ac=videolist&wd=...`)
- **Redis/Upstash/Kvrocks：** 核心存储后端，用于播放记录、收藏、弹幕等数据持久化
