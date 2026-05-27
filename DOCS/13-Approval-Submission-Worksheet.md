# Approval Submission Worksheet

Issue: MediaFox-056  
Date: 2026-05-27

## Purpose
Fill this worksheet during portal submissions, then copy the generated note blocks into beads updates.

## Operator
- Name:
- Date (UTC):
- Session start (UTC):
- Session end (UTC):

## Environment
- App base URL:
- Support email:
- Privacy policy URL:
- Terms URL:

## Portal Submissions

### Meta Sandbox (MediaFox-y31.1)
- Portal URL:
- Started (UTC):
- Completed (UTC):
- Meta app ID:
- Redirect URI confirmed:
- Permissions configured:
  - pages_manage_posts:
  - pages_read_engagement:
  - pages_show_list:
  - instagram_basic:
  - instagram_content_publish:
  - instagram_manage_insights:
- Result: Pending / Completed / Blocked
- Blocking reason (if any):
- Evidence links:
  -
  -

### Meta Review Submit (MediaFox-y31.3)
- Portal URL:
- Started (UTC):
- Submitted (UTC):
- Submission/reference ID:
- Result: Pending / Submitted / Blocked
- Blocking reason (if any):
- Evidence links:
  -
  -

### LinkedIn Community API (MediaFox-y31.4)
- Portal URL:
- Started (UTC):
- Submitted (UTC):
- Submission/reference ID:
- Scopes requested:
  - r_liteprofile
  - w_member_social
  - Other:
- Result: Pending / Submitted / Blocked
- Blocking reason (if any):
- Evidence links:
  -
  -

### Discord Verification (MediaFox-y31.5)
- Portal URL:
- Started (UTC):
- Submitted (UTC):
- Submission/reference ID:
- Current server count:
- Message content intent requested: Yes / No
- Result: Pending / Submitted / Deferred / Blocked
- Deferred reason or blocking reason:
- Evidence links:
  -
  -

## Copy-Ready Beads Notes

### For MediaFox-y31.1
Meta sandbox update: <completed|blocked>. App ID <id>. Redirect URI <confirmed/not confirmed>. Permissions configured: <list>. Evidence: <links>. Blocker: <none or reason>.

### For MediaFox-y31.3
Meta review submission update: <submitted|blocked>. Submission ID <id>. Submitted at <time UTC>. Evidence: <links>. Blocker: <none or reason>.

### For MediaFox-y31.4
LinkedIn application update: <submitted|blocked>. Submission ID <id>. Requested scopes: <list>. Submitted at <time UTC>. Evidence: <links>. Blocker: <none or reason>.

### For MediaFox-y31.5
Discord verification update: <submitted|deferred|blocked>. Submission ID <id or n/a>. Server count <count>. Intent review: <yes/no>. Evidence: <links>. Reason: <none or reason>.

## Copy-Ready Beads Commands

```bash
bd update MediaFox-y31.1 --notes "Meta sandbox update: ..."
bd update MediaFox-y31.3 --notes "Meta review submission update: ..."
bd update MediaFox-y31.4 --notes "LinkedIn application update: ..."
bd update MediaFox-y31.5 --notes "Discord verification update: ..."
```

Close commands when done:

```bash
bd close MediaFox-y31.1 --reason "Completed in portal"
bd close MediaFox-y31.3 --reason "Submitted to Meta review"
bd close MediaFox-y31.4 --reason "Submitted to LinkedIn review"
bd close MediaFox-y31.5 --reason "Submitted to Discord verification" 
```