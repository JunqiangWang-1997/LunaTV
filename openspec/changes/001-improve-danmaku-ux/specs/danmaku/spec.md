## (moved) ADDED Requirements

### Requirement: Danmaku Input Auto-Clear (archived)

The player SHALL automatically clear the danmaku input field after successful submission to improve continuous sending experience.

#### Scenario: Input cleared on success

- **WHEN** user sends a danmaku and the API responds with success
- **THEN** the input field SHALL be cleared immediately
- **AND** the user can immediately type a new danmaku without manual deletion

#### Scenario: Input preserved on failure

- **WHEN** user sends a danmaku and the API responds with an error
- **THEN** the input field SHALL retain the original text
- **AND** the user can edit and retry without re-typing

### Requirement: Automatic Danmaku Import

The system SHALL automatically search for and import matching danmaku from Bilibili when a video is loaded, without requiring manual user input.

#### Scenario: Auto-import on video load

- **WHEN** user clicks play on a video/episode
- **AND** local danmaku cache is empty (`danmaku:{source}:{id}:{episode}` not found)
- **THEN** the system SHALL automatically:
  1. Check for canonical mapping (`danmaku:map:{source}:{id}`)
  2. If no mapping exists, search Bilibili API using video title and year
  3. Match the best result (by title similarity, year, and type=bangumi)
  4. Extract season_id and retrieve episode list
  5. Get cid for the target episode number
  6. Import danmaku from Bilibili using the found cid
  7. Cache the mapping for future use
- **AND** display the imported danmaku in the player
- **AND** NOT block the video from starting playback

#### Scenario: Auto-import success feedback

- **WHEN** auto-import successfully finds and imports danmaku from Bilibili
- **THEN** display a subtle notification (e.g., "已自动加载 123 条弹幕")
- **AND** update the player danmaku display without page reload

#### Scenario: Auto-import failure fallback

- **WHEN** auto-import cannot find matching cid in Bilibili (no search results, API error, or episode mismatch)
- **THEN** display a notification with clear message (e.g., "未找到 Bilibili 弹幕，可手动导入")
- **AND** keep the manual import button accessible
- **AND** log the failed search details for debugging
- **AND** NOT attempt other sources automatically

#### Scenario: Auto-import caching

- **WHEN** auto-import successfully finds Bilibili cid and imports danmaku
- **THEN** store the mapping in `danmaku:map:{source}:{id}` with cid information
- **AND** subsequent plays of the same series SHALL use the cached cid
- **AND** NOT repeat the Bilibili search API call

#### Scenario: Auto-import for series episodes

- **WHEN** user switches to another episode in the same series
- **AND** the series has an existing canonical mapping with Bilibili season_id
- **THEN** automatically derive the new episode's cid from cached season data
- **AND** import danmaku for the new episode
- **AND** NOT require re-searching Bilibili

## MODIFIED Requirements

### Requirement: Danmaku Sending Feedback

The system SHALL provide immediate feedback after danmaku submission.

#### Scenario: Success notification

- **WHEN** danmaku is successfully sent to the server
- **THEN** display a success notification (e.g., "弹幕发送成功")
- **AND** clear the input field automatically (NEW)
- **AND** add the danmaku to the player display immediately

#### Scenario: Failure notification

- **WHEN** danmaku submission fails
- **THEN** display an error notification (e.g., "弹幕发送失败")
- **AND** preserve the input field content (NEW)
- **AND** allow the user to retry

### Requirement: Manual Danmaku Import Fallback

The danmaku import component SHALL remain accessible as a fallback when automatic import fails or user prefers manual control.

#### Scenario: Manual import remains available

- **WHEN** automatic import fails to find matching danmaku
- **THEN** display a "手动导入弹幕" button or link
- **AND** preserve the existing single-episode import functionality

#### Scenario: Manual import for custom sources

- **WHEN** user wants to import from a specific source (e.g., specific Bilibili cid)
- **THEN** allow manual selection of:
  - Danmaku source (Bilibili/DanDanPlay)
  - External ID (cid/episodeId)
- **AND** import for the current episode only
- **AND** override any automatic import results
