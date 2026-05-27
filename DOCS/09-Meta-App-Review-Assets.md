# Meta App Review Asset Packet

Issue: MediaFox-y31.2
Date: 2026-05-27

## Purpose
Provide copy-ready responses and evidence checklist for Meta app review submission.

## Product Description (submission text)
MediaFox helps game studios plan, approve, schedule, and publish social content across connected channels from a single workspace. The Meta integration allows authorized studio users to connect Facebook Pages and linked Instagram business accounts for post publishing and performance analytics.

## Why Permissions Are Needed
- pages_manage_posts: publish scheduled and approved page posts.
- pages_read_engagement: retrieve engagement stats for reporting.
- pages_show_list: list pages available to the authenticated user.
- instagram_basic: identify connected Instagram business account metadata.
- instagram_content_publish: publish approved media posts.
- instagram_manage_insights: fetch post/account insights for analytics dashboards.

## Data Handling Statement
- Access tokens are encrypted at rest.
- Tokens are used only for user-authorized actions.
- No credential sharing across studios.
- Users can disconnect accounts at any time.

## User Flow Summary
1. User opens Accounts page and starts Meta connect.
2. User authorizes requested scopes in Meta consent flow.
3. MediaFox receives callback and stores encrypted tokens.
4. Connected Facebook/Instagram accounts appear in workspace.
5. User publishes content or views analytics for connected accounts.

## Required Evidence Attachments
- Screencast of full connection flow
- Screenshot of connected accounts list
- Screenshot of publish composer with Meta destination selected
- Screenshot of analytics page with Meta metrics
- Privacy policy URL and support contact

## Review Q&A Template
Q: Why do you need this permission?
A: To enable user-initiated publishing and analytics features in MediaFox for the user's own connected page/account.

Q: How do users control access?
A: Users explicitly connect accounts and can disconnect any account in MediaFox immediately.

Q: Do you store token data securely?
A: Yes. Tokens are encrypted at rest and only used server-side for authorized operations.

## Submission Checklist
- App in correct mode for review
- Scopes selected and mapped to evidence
- Screencast attached
- Privacy policy/support links verified
- Responses reviewed for clarity and consistency
