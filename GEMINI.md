# Gemini 项目背景：LunaTV

本文件用于汇总项目现状、已完成工作和遗留问题，便于后续管理。

## 1. 项目概述

- **项目名称：** LunaTV，跨平台视频聚合播放器
- **技术栈：** Next.js 14、TypeScript、Tailwind CSS、pnpm、Upstash（Redis）
- **目标：** 实现完整的弹幕（Danmaku）系统

## 2. 已完成工作与当前状态 ✅

已实现完整的弹幕系统，包含后端 API、数据库层和前端集成。

- **后端 API（`src/app/api/danmaku/route.ts`）：** ✅ **完成并可用**

  - `POST` 保存弹幕
  - `GET` 获取弹幕
  - 使用 Zod 校验参数
  - 错误处理与日志

- **数据库层（`src/lib/`）：** ✅ **完成并可用**

  - `IStorage` 接口扩展了 `zadd`/`zrange`，支持 Redis Sorted Set 操作
  - `UpstashRedisStorage` 实现了弹幕的 JSON 序列化/反序列化
  - `DbManager` 统一暴露存储能力

- **前端集成（`src/app/play/page.tsx`）：** ✅ **完成并可用**
  - ArtPlayer 弹幕插件通过 GET API 加载弹幕
  - `beforeEmit` 回调通过 POST API 发送弹幕
  - 已修复 Next.js SSR/Webpack 构建错误，采用动态导入弹幕插件

## 2.1. 跨源弹幕共享（2025-10-20）

**功能亮点：**

- 支持同一剧集在不同源（如 Bilibili、DanDanPlay）间弹幕自动复用，无需重复导入
- 采用 canonical key（规范化键）策略，按剧名+年份生成唯一 slug，实现弹幕跨源共享
- 自动写入 provider→slug 映射，读取时优先 canonical 回退，保证弹幕一致性
- 前端导入自动携带 title（和可选 year），后台 ensure/cron 也补充映射，提升自动化体验

**技术细节：**

- 存储结构：
  - `danmaku:{source}:{id}:{episode}`：原始弹幕按源分集存储
  - `danmaku:canonical:{slug}:{episode}`：规范化弹幕键，slug 由剧名+年份生成
  - `danmaku:map:{source}:{id}`：provider→slug 映射，JSON 含 title/year/slug
- 读写流程：
  - 导入弹幕时，双写 provider 键和 canonical 键，并写入映射表
  - 读取弹幕时，优先 provider 键，若为空则查映射表回退到 canonical 键
- 兼容性与隔离性：
  - 每集弹幕独立，切换集数不会串弹幕
  - 刷新/切源后能自动命中 canonical，实现真正的跨源共享

**测试建议：**

- 在 A 源导入弹幕，B 源同集直接播放可见弹幕
- 切换集数验证弹幕隔离
- 刷新页面验证弹幕持久性

## 3. 关键方案：动态导入模式 ⭐

主要解决了 `artplayer-plugin-danmuku` 插件在 Next.js SSR 下的兼容性问题。

### 问题

```
TypeError: Cannot read properties of undefined (reading 'length')
at installChunk (webpack-runtime.js:193:41)
```

### 根本原因

- 插件包含仅浏览器可用代码
- 顶层静态 import 导致 SSR 阶段被处理
- 服务端 Webpack 解析失败

### 解决方案

**动态导入（仅客户端加载）**

1. 移除静态 import：
   ```typescript
   // 之前（有 SSR 错误）：
   import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
   // 之后（无静态 import）：
   // 插件将在客户端动态加载
   ```
2. 增加异步初始化函数：
   ```typescript
   const initializePlayerWithDanmaku = async () => {
     const artplayerPluginDanmukuModule = await import(
       'artplayer-plugin-danmuku'
     );
     const artplayerPluginDanmuku =
       artplayerPluginDanmukuModule.default || artplayerPluginDanmukuModule;
     artPlayerRef.current = new Artplayer({
       // ...配置
       plugins: [
         artplayerPluginDanmuku({
           /* 配置 */
         }),
       ],
     });
   };
   initializePlayerWithDanmaku();
   ```

### 优势

1. ✅ 完全绕过 SSR，插件代码只在浏览器运行
2. ✅ 支持代码分割，插件单独加载
3. ✅ 性能更优，初始包体更小
4. ✅ 兼容未来 Next.js 严格 SSR
5. ✅ 无需改动 next.config.js

## 4. 系统架构

### 数据流

```
用户发送弹幕 → 前端 beforeEmit 回调
              ↓
         POST /api/danmaku
              ↓
      Zod 校验与处理
              ↓
  UpstashRedisStorage.zadd()（JSON 序列化）
              ↓
        Upstash Redis ZADD
              ↓
   Sorted Set: danmaku:{source}:{id}:{episode}
```

```
页面加载 → 插件拉取弹幕
              ↓
      GET /api/danmaku?source=...&id=...&episode=...
              ↓
  UpstashRedisStorage.zrange()
              ↓
 Upstash Redis ZRANGE（自动解析 JSON）
              ↓
   返回弹幕数组到前端
              ↓
   ArtPlayer 显示弹幕
```

### 存储结构

- 键格式：`danmaku:{source}:{id}:{episode}`
- 数据结构：Redis Sorted Set
- 分数：弹幕时间（秒）
- 成员：JSON 序列化弹幕对象
  ```json
  {
    "text": "弹幕内容",
    "time": 123.45,
    "color": "#FFFFFF",
    "mode": 0,
    "serverTime": 1729350000000
  }
  ```

## 5. 测试建议

1. **弹幕发送测试：**

   - 进入视频页面，发送弹幕，弹幕应立即显示
   - 浏览器控制台出现“弹幕发送成功”

2. **弹幕加载测试：**

   - 刷新页面，已发送弹幕应按时间点显示
   - Network 面板可见 GET 请求

3. **多集测试：**

   - 第 1 集发送弹幕，切到第 2 集不显示第 1 集弹幕

4. **错误处理测试：**
   - 发送空弹幕应有提示
   - 离线/网络异常应有错误提示

## 6. 已知限制与后续优化

### 当前限制

1. 无用户认证，弹幕为匿名
2. 无防刷/防垃圾机制
3. 无弹幕审核功能
4. 无弹幕持久化备份

### 潜在优化

1. 集成用户系统
2. 实现速率限制
3. 增加弹幕举报/隐藏功能
4. 支持弹幕历史回放
5. 热门视频弹幕池机制

## 7. 故障排查

### 构建错误

1. 清理 `.next` 文件夹：`Remove-Item -Path ".next" -Recurse -Force`
2. 重新安装依赖：`pnpm install --force`
3. 检查插件版本：`artplayer-plugin-danmuku@^5.2.0`

### 弹幕无法显示

1. 检查浏览器控制台错误
2. 检查 Upstash Redis 连接和环境变量
3. 直接测试 API：
   - GET: `http://localhost:3000/api/danmaku?source=test&id=test&episode=0`
   - POST: 使用 Postman/curl 发送正确 payload

### SSR 错误

- 确保没有任何地方静态 import `artplayer-plugin-danmuku`
- 插件必须在 useEffect/异步函数内动态导入
- 检查 IDE 自动导入

## 8. 主要改动文件

- `src/app/api/danmaku/route.ts` - 弹幕 API
- `src/app/play/page.tsx` - 前端集成与动态导入
- `src/lib/types.ts` - IStorage 接口扩展
- `src/lib/upstash.db.ts` - Sorted Set 方法实现
- `GEMINI.md` - 本文档

- `next.config.js` - 无需改动
- `package.json` - 插件已安装，无需新增依赖

## 9. 总结

弹幕系统已完整上线，具备：

- ✅ 完整后端 API
- ✅ 正确数据库存储
- ✅ 前端集成与动态导入
- ✅ SSR 兼容性
- ✅ 零构建错误
- ✅ 可用于生产环境
- ✅ 已实现跨源弹幕共享，支持多源同剧集弹幕自动复用，提升用户体验和数据一致性
- ✅ 设计可扩展，后续可结合搜索结果自动补齐 title/year，进一步增强 slug 稳定性和后台管理能力

**后续可聚焦：** 测试、用户反馈、弹幕过滤/样式/分析等新功能
