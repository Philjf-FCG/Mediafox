# LinkedIn Community API Application Packet

Issue: MediaFox-y31.4
Date: 2026-05-27

## Objective
Prepare a ready-to-submit application narrative for LinkedIn Community Management access.

## Integration Summary
MediaFox allows authorized studio users to connect their LinkedIn account and publish approved posts. MediaFox also reads profile metadata required to identify the posting identity and display connected account details.

## Requested Capabilities
- Member publishing support
- Organization publishing support (if granted)
- Basic profile identity resolution for account connection

## Scope Plan
Default scopes used by MediaFox:
- r_liteprofile
- w_member_social

Optional scope strategy:
- Additional organization scopes enabled only when LinkedIn app approval and user permissions permit.

## Security and Compliance Statement
- OAuth tokens encrypted at rest.
- Access scoped to authenticated user consent.
- Per-studio account boundaries enforced.
- User can disconnect LinkedIn account at any time.

## User Flow (application text)
1. User clicks Connect LinkedIn in MediaFox Accounts.
2. User authorizes LinkedIn consent.
3. MediaFox stores encrypted token and linked identity.
4. User creates post in MediaFox and publishes to LinkedIn.
5. MediaFox tracks publish status and analytics where available.

## Evidence Checklist
- Connect flow screenshot (before and after)
- LinkedIn account visible in MediaFox accounts list
- Publish composer with LinkedIn destination
- Successful publish status screenshot
- Error handling screenshot (if token expired)

## Submission Responses Draft
Use case category:
- Social media management for business users

Primary value:
- Streamlined editorial workflow and reduced manual copy/paste publishing tasks

Data retention:
- Minimal required retention for account connectivity and publish status

Support contact:
- support@mediafox.local (replace with production support address)
