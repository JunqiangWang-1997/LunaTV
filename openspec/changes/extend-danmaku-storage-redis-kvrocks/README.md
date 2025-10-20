# Change Proposal: Extend Danmaku Storage to Redis/Kvrocks

Status: Draft (Needs Review)
Owner: @maintainers
Last Updated: 2025-10-20

## Summary

Unify and formalize danmaku storage behavior across all supported backends (Upstash Redis, Redis, Kvrocks) using a consistent ZSET + JSON member schema, canonical mapping keys, and per-user display settings keys. This proposal documents the contract already mostly implemented, clarifies any gaps, and sets acceptance criteria to verify true parity.

## Motivation

- Ensure identical behavior regardless of storage backend
- Make key naming, member schema, and canonical fallback explicit
- Reduce regressions when switching from Upstash to Redis/Kvrocks
- Provide a reference for tests and admin docs

## Scope

In scope:

- Danmaku episode storage (ZSET)
- Canonical mapping and canonical fallback
- Per-user danmaku display settings keys
- Read/write semantics and error handling

Out of scope:

- Import pipeline specifics for third-party providers (covered elsewhere)
- Player-side UI/UX options (already specified)

## Storage Contract

### Keys

- Episode ZSET: `danmaku:{source}:{id}:{episode}`
  - score: time in seconds (float)
  - member: JSON string conforming to Member Schema
- Canonical ZSET: `danmaku:canonical:{slug}:{episode}`
- Provider mapping: `danmaku:map:{source}:{id}` → JSON: `{ slug, title, year, source, id }`
- Per-user settings: `user:settings:danmaku:{userId}` → JSON DanmakuSettings

Notes:

- `{episode}` is 0-based integer in storage; UI presents 1-based when needed
- `slug` format defined in `src/lib/danmaku.util.ts` (do not diverge)

### Member Schema

```
{
  "time": number,         // seconds, used as ZSET score
  "type": "scroll" | "top" | "bottom",
  "text": string,         // content
  "color": number,        // rgb int (e.g. 16777215 for #FFFFFF)
  "author"?: string,      // optional nickname or uid hash
  "id"?: string,          // optional unique ref (e.g. provider cid + index)
  "date"?: number         // optional epoch ms
}
```

- Minimal required fields: time, type, text, color
- Extra fields are allowed but ignored by readers

### Read Semantics

- GET flow:

  1. Try episode ZSET `danmaku:{source}:{id}:{episode}`
  2. If empty and canonical exists, fallback to `danmaku:canonical:{slug}:{episode}`
  3. Return items ordered by score ascending

- Range:
  - full range [min=-inf, max=+inf], limit may apply in future; current endpoints return all

### Write Semantics

- POST appends one member to the episode ZSET keyed by time as score
- Bulk import may use pipeline/multi zadd; duplicates are not de-duplicated at storage level
- Optional: also write to canonical if current episode is canonical-sourced

### Per-user Settings

- Key: `user:settings:danmaku:{userId}`
- Schema (DanmakuSettings):

```
{
  "opacity": number,            // 0..1, default 0.66
  "fontSize": number,           // px, default 25
  "area": number,               // 0..1 (e.g., 0.5 for half-screen)
  "speed": number,              // plugin speed value (smaller is slower); default 7
  "syncWithPlayback": boolean   // follow video rate; default true
}
```

- Read: return saved; if none, return defaults
- Write: upsert full object, validate bounds

## Backend Parity Requirements

- Upstash, Redis, Kvrocks must all:
  - Support ZADD with JSON string members and float scores
  - Return members as strings that parse into the Member Schema
  - Preserve ordering by score asc on reads
  - Handle UTF-8 safely for text field

## API Contracts

- GET `/api/danmaku` → reads with canonical fallback
- POST `/api/danmaku` → writes a single member
- GET `/api/danmaku/settings` → returns per-user settings
- POST `/api/danmaku/settings` → validates and saves per-user settings

All request/response payloads are validated via Zod and typed in `src/lib/types.ts`.

## Error Handling

- On backend errors, respond 5xx with code and message; do not partially succeed without reporting
- On invalid payload, 400 with validation detail
- On auth-required endpoints (settings POST), 401 if not logged in

## Migration and Compatibility

- No data migration required if following this contract; existing Upstash data is compatible
- If switching backends, ensure env `NEXT_PUBLIC_STORAGE_TYPE` is set and credentials are configured

## Acceptance Criteria

- With each backend selected via `NEXT_PUBLIC_STORAGE_TYPE`, the following pass:
  1. Write N sample members to an episode key and read them back in order
  2. GET fallback uses canonical when episode has no members
  3. POST adds a member and it becomes readable immediately
  4. Per-user settings round-trip (GET default → POST override → GET returns override)

## Test Plan (minimal)

- Add integration tests that parameterize storage backend (mock by injecting db implementation)
- Fixtures: small array of 5 members with diverse colors and types
- Assert ordering, JSON parsing, and fallback behavior

## Rollout

- Phase 1: Approve this spec
- Phase 2: Verify current implementations meet the contract; close any gaps
- Phase 3: Add/adjust tests and docs

## Notes

- Do not introduce new dependencies without prior approval
- Maintain strict TypeScript types and keep Zod schemas in sync
