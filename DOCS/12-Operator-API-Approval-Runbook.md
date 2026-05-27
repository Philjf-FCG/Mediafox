# Operator API Approval Runbook

Issue: MediaFox-a5l  
Date: 2026-05-27

## Objective
Execute all remaining external portal submissions in one operator session with a clear order, copy-ready text, and a completion log.

## Inputs
- Meta setup checklist: DOCS/08-Meta-App-Sandbox-Setup.md
- Meta review packet: DOCS/09-Meta-App-Review-Assets.md
- LinkedIn application packet: DOCS/10-LinkedIn-Community-API-Application.md
- Discord verification packet: DOCS/11-Discord-Bot-Verification-Plan.md
- Fill-in worksheet: DOCS/13-Approval-Submission-Worksheet.md

## Session Plan
1. Complete Meta app and sandbox setup.
2. Submit Meta app review.
3. Submit LinkedIn Community Management API application.
4. Prepare Discord verification draft and submit if threshold reached.
5. Record evidence links and outcomes in the log table below.

## Meta Setup Operator Checklist
1. Open Meta Developer dashboard and select the MediaFox app.
2. Confirm products are enabled: Facebook Login, Instagram Graph API.
3. Confirm redirect URI exactly matches production callback.
4. Verify permissions requested:
   - pages_manage_posts
   - pages_read_engagement
   - pages_show_list
   - instagram_basic
   - instagram_content_publish
   - instagram_manage_insights
5. Run sandbox validation flow from MediaFox Accounts page.
6. Save screenshot evidence listed in DOCS/08.

## Meta Review Copy Block
Use this block in permission justifications and app summary fields.

MediaFox helps game studios plan, approve, schedule, and publish social content across connected channels from a single workspace. The Meta integration allows authorized studio users to connect Facebook Pages and linked Instagram business accounts for post publishing and performance analytics. Tokens are encrypted at rest, scoped to explicit user consent, and can be revoked by disconnecting accounts at any time.

## LinkedIn Application Copy Block
Use this block for use-case and product description fields.

MediaFox is a social media operations platform for studio teams. Authorized users connect LinkedIn, create approved content, and publish directly from MediaFox to reduce manual copy/paste workflows. OAuth tokens are encrypted at rest, access is scoped to user consent, and per-studio boundaries prevent cross-tenant data access.

## Discord Verification Copy Block
Use this block for bot purpose and trust/safety fields.

MediaFox uses Discord integration to post approved updates for studio communities. Access is tenant-scoped, publish actions are audited, and rate limits are respected with retry backoff. Users can disconnect access at any time. Verification is requested to support scale while preserving least-privilege behavior and clear support escalation paths.

## Evidence Bundle Checklist
- Full connect flow recording for each platform submitted
- Connected-account screenshots in MediaFox
- Publish flow screenshots
- Analytics or publish-result screenshot
- Privacy policy URL and support contact URL

## Completion Log
| Time (UTC) | Portal | Action | Result | Evidence Link | Notes |
|---|---|---|---|---|---|
| | Meta | App sandbox validation | Pending | | |
| | Meta | App review submit | Pending | | |
| | LinkedIn | Community API application submit | Pending | | |
| | Discord | Verification submit or deferred note | Pending | | |

Tip: Fill DOCS/13 first, then copy final note blocks into beads updates.

## Beads Update Instructions
After each portal action, run:

1. bd update MediaFox-y31.1 --notes "<status update>"
2. bd update MediaFox-y31.3 --notes "<status update>"
3. bd update MediaFox-y31.4 --notes "<status update>"
4. bd update MediaFox-y31.5 --notes "<status update>"

When each completes:

1. bd close MediaFox-y31.1 --reason "Completed in portal"
2. bd close MediaFox-y31.3 --reason "Submitted to Meta review"
3. bd close MediaFox-y31.4 --reason "Submitted to LinkedIn review"
4. bd close MediaFox-y31.5 --reason "Submitted to Discord verification" or deferred reason

Finally close epic y31 once all sub-issues are done.