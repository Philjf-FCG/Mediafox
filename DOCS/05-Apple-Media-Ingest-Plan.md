# Apple Ecosystem Media Ingest Plan

Date: 2026-05-27
Owner: MediaFox engineering

## Goal
Provide a reliable media ingest path for Apple-heavy teams (iPhone, iPad, Mac) with minimal friction and consistent behavior across desktop and mobile.

## Phase 1 (Implemented)
- Allow core Apple media upload formats:
  - image/heic
  - image/heif
  - video/quicktime (.mov)
- Existing Media Library upload flow now accepts these file types.

## Phase 2 (Near-term)
- Server-side transcode pipeline:
  - HEIC/HEIF -> JPEG for broad browser/social compatibility
  - MOV -> MP4/H.264 for publish readiness
- Preserve original file plus generated derivative(s).
- Add compatibility badges in Media Library (original vs publish-ready).

## Phase 3 (Workflow)
- Bulk mobile upload UX improvements:
  - Multi-select upload progress
  - Retry failed items
  - Background upload resume where possible
- Add preset tags on upload (platform, campaign, game title).

## Phase 4 (Apple-specific ingestion options)
- Shared album/link import helper:
  - User provides shared link
  - System validates and imports assets with metadata extraction
- Optional companion flow for iOS Shortcut integration to post directly into MediaFox upload endpoint.

## Technical Notes
- Keep upload endpoint MIME allowlist explicit and audited.
- Add max dimensions and duration checks before queueing publish jobs.
- Add derivative generation as asynchronous worker tasks to keep upload latency low.

## Risks
- HEIC rendering support varies by browser.
- MOV codecs vary; some files need transcode before publish.
- Large ProRes files can exceed practical upload limits.

## Success Metrics
- Upload success rate for Apple formats >= 98%.
- Time-to-first-preview under 5 seconds for typical iPhone photos.
- Fewer publish failures caused by unsupported source formats.

## Next Action
- Implement derivative generation pipeline and mark publish-ready asset variants in Media Library.
