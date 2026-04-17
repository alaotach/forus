# Media Hardening Status (April 17, 2026)

Legend:
- [x] Complete
- [~] Partial / needs verification
- [ ] Missing

## 0) Core Principle

- [x] S3 as source of truth
- [x] Backend controls media access
- [x] Client behaves as cache + UX layer
- [x] Signed URLs are temporary and not persisted by current write paths

## 1) Security & Access Control

- [x] Every `/media/:id` requires auth (JWT)
- [x] Ownership validation (owner OR couple)
- [x] Cross-user access rejected (403)
- [x] Signed URL expiry configured to short TTL (currently 120s)
- [~] S3 bucket private (infra setting, cannot be proven from repo code alone)
- [x] No signed URL persisted in current metadata write paths
- [x] Media endpoints rate limited
- [x] UUID-based IDs used (prevents simple ID enumeration)

## 2) Media Storage (S3 correctness)

- [x] Structured key format: `uploads/{type}/{userId}/{uuid_timestamp.ext}`
- [x] File type validation (image/audio only)
- [x] File size limits enforced
- [x] Unique naming (UUID + timestamp)
- [x] Metadata fields persisted: `id`, `fileKey`, `type`, `ownerId`, `createdAt` (+ `coupleCode`)

## 3) Upload Flow

- [x] `POST /generate-upload-url`
- [x] Pre-signed PUT URL returned
- [x] Client uploads directly to S3
- [x] Backend does not handle file binary
- [x] Metadata persisted only after upload finalization (`POST /complete-upload`)

## 4) Download / Access Flow

- [x] `GET /media/:id`
- [x] Returns signed GET URL
- [x] URL consumed immediately in playback/download flow
- [x] Retry path implemented on media-access failures
- [x] Old URLs are not persisted/reused as storage source

## 5) Client-Side Caching (WhatsApp-style)

- [x] Temp cache download on demand
- [~] Cache map uses `fileKey -> localPath` (not `mediaId -> localPath`, functionally equivalent)
- [x] Cached file is reused (no re-download)
- [~] Lazy loading is partial (some hydration paths still eager over loaded lists)
- [~] Loading state exists at screen level; per-media loading UX can be improved

## 6) Save to Device

- [x] Save to device action implemented
- [x] Cache file moved to persistent storage before library save
- [x] Cache entry removed after save
- [x] Permissions handled (with Android Expo Go guard)

## 7) Cache Management

- [x] Max cache size implemented (100MB)
- [x] LRU + TTL cleanup logic implemented
- [x] Unused/expired files cleaned automatically during cache operations
- [x] Corrupted/missing cache entries handled and pruned
- [ ] Background cleanup task not implemented yet

## 8) Delete Lifecycle

- [x] `DELETE /media/:id`
- [x] Deletes S3 object + metadata
- [x] Client cache removed in delete flows where fileKey is available
- [~] Orphan cleanup script exists; scheduler/cron automation still pending

## 9) Performance Optimization

- [ ] Explicit image transcoding/compression to WebP not implemented server-side
- [~] Audio capture uses compression settings, but current bitrate is 128 kbps (target 64-96 pending)
- [~] CloudFront signed delivery implemented in backend (env-gated); distribution rollout/verification pending
- [x] Duplicate downloads reduced via cache + retries
- [ ] Progressive loading not implemented

## 10) Failure Handling

- [x] Retry on signed URL/media access issues
- [x] Retry on network failures in access/download paths
- [x] Graceful fallback paths present in UI/service call sites
- [x] Timeout handling implemented
- [ ] Partial download resume/recovery not implemented

## 11) Migration Safety

- [ ] Backup-before-migration workflow not enforced in scripts
- [ ] Staging migration runbook/proof not captured in repo
- [~] Legacy `mediaUrl` replacement script exists; full verification artifact missing
- [ ] Legacy fields automatic purge step not implemented globally
- [~] Cloudinary removed from active runtime paths, but legacy backup artifacts still reference old names

## 12) Monitoring

- [x] Media access is logged via backend request logs
- [x] Upload/download failure metrics hooks implemented
- [ ] S3 usage monitoring dashboards/alarms not implemented in repo
- [ ] Spike alerting not implemented yet

## 13) Advanced (Later)

- [ ] Media proxy hard mode (fully hide S3 semantics)
- [ ] End-to-end encryption for media
- [ ] Background prefetching
- [~] Offline mode support: cold-start timeline persistence added for chat/vault; full app-wide offline parity still pending
- [ ] Media deduplication

## Immediate Priority Order

1. Finalize infra security proof (`private bucket`, CloudFront decision, alarms)
2. Add background cache cleanup scheduling
3. Add migration safety runbook + production evidence
4. Lower audio bitrate to 64-96 kbps target
5. Remove legacy backup artifacts that still mention Cloudinary
