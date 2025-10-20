# Danmaku Storage Parity — Redis/Kvrocks/Upstash

This document defines the exact storage contract for danmaku across supported backends.

## Keyspace

- Episode ZSET: `danmaku:{source}:{id}:{episode}`
- Canonical ZSET: `danmaku:canonical:{slug}:{episode}`
- Provider mapping: `danmaku:map:{source}:{id}` → JSON
- User settings: `user:settings:danmaku:{userId}` → JSON

## ZSET Member

- score: `time` (float seconds)
- value: JSON string

Required fields: `time`, `type`, `text`, `color`

## Read Algorithm

1. Try episode key
2. If empty, try canonical key
3. Return ordered by score asc

## Write Algorithm

- Single: ZADD with score=time, value=JSON.stringify(member)
- Bulk: pipeline/multi with multiple ZADD entries

## Validation

- Ensure UTF-8 safety for text
- Clamp/validate user settings per schema bounds

## Backend Notes

- Upstash: uses REST; ensure floating scores serialized with dot decimal
- Redis/Kvrocks: use node-redis client; all operations via `redis-base.db.ts`

## Non-goals

- No de-duplication at storage layer
- No TTLs by default
