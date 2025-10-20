# Danmaku Design Notes

本文件描述弹幕能力在实现层面的技术要点与约定，补充 `spec.md` 的行为规范。

## Storage Keys

- 弹幕集合（Sorted Set）：`danmaku:{source}:{id}:{episode}`，score=弹幕出现时间（秒，float）
- provider 映射：`danmaku:map:{source}:{id}`（JSON，包含 title/year/slug，可选 seasonId 等）
- canonical 集合：`danmaku:canonical:{slug}:{episode}`（用于不同来源共享）

## Bilibili Integration

- 搜索接口：`/x/web-interface/wbi/search/type`（WBI 签名参数 wts/w_rid）
- 详情接口：`/pgc/view/web/season?season_id=...`（获取分集，推导 episode→cid）
- 弹幕接口：`/x/v1/dm/list.so?oid={cid}`（XML `<d>` 解析）

Headers 统一：UA、Referer、Accept-Language、Cache-Control；支持 `.env.local` 中的 `BILIBILI_COOKIE`（可选）注入，严禁入库。

## Import Priority

1. 使用已有 seasonId 缓存直接推导目标集 cid
2. DanDanPlay 兜底
3. B 站 WBI 搜索 → season 详情 → cid → 弹幕导入

失败不阻塞播放；错误信息记录到服务端日志以便定位。

## Notes

- 统一时间单位为秒；颜色、模式解析参考 B 站 `<d p="...">` 参数字段。
- 标题匹配存在噪声，后续可引入标题归一化与模糊匹配以提升命中率。
