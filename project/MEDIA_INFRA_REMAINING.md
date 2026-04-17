# Media Infra Remaining Tasks

This checklist captures the remaining production hardening work after secure S3 media + finalize-upload flow is implemented.

## 1) CDN and edge delivery

- Add CloudFront in front of private S3 access flow if global latency becomes a bottleneck.
- Keep bucket private; use signed origin access strategy (OAC/OAI).
- Validate signed URL TTL strategy for mobile playback retries.

## 2) Monitoring and alerting

- Export backend process logs to CloudWatch Logs with retention policy.
- Create alarms for:
  - 5xx rate spike on media endpoints
  - elevated media failure metrics (`/media/metrics/failure` snapshot)
  - EC2 CPU/memory/disk pressure
- Add alert routing (email/Slack/PagerDuty).

## 3) Scheduled cleanup automation

- Run orphan cleanup script as a scheduled job:
  - command: `npm run cleanup:orphan-media`
  - recommended cadence: hourly or every 6 hours
- Capture stdout/stderr to logs and alert on non-zero exits.

## 4) Migration execution proof

- Run media schema migration in production if legacy records exist.
- Save run artifact: timestamp, migrated count, skipped count, failed count.
- Keep a rollback note for failed batch handling.

## 5) Security hardening

- Rotate `MEDIA_AUTH_JWT_SECRET` and IAM credentials/role policies on schedule.
- Verify least privilege IAM for S3 + DynamoDB only.
- Ensure IMDSv2 required and no static credentials in app repo.

## 6) Capacity and resilience

- Add load test for upload and playback bursts.
- Define SLOs for upload success, playback fetch latency, and error budget.
- Decide if media metadata should move from DynamoDB scan-heavy ops to indexed queries for scale.

## Done Baseline (already implemented)

- Private S3 object storage with signed PUT/GET URLs.
- Metadata-only persistence (no long-lived signed URL storage).
- Authenticated media routes with JWT and couple-level authz checks.
- Upload finalization contract (`/generate-upload-url` -> S3 PUT -> `/complete-upload`).
- Delete lifecycle cleanup (S3 + metadata).
- Orphan cleanup script scaffold.
- Client caching with TTL/LRU/size policy and explicit save-to-device flow.
