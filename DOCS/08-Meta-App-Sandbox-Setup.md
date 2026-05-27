# Meta Developer App and Sandbox Setup

Issue: MediaFox-y31.1
Date: 2026-05-27

## Objective
Create/verify Meta developer app and sandbox settings required for MediaFox Facebook/Instagram integrations.

## Prerequisites
- Meta Business Manager admin access
- Meta Developer account access
- Working redirect URL for production and local testing

## Required App Configuration
- Product: Facebook Login
- Product: Instagram Graph API
- Product: Pages API permissions aligned with publishing/insights use

## Environment Variables to Confirm
- META_APP_ID
- META_APP_SECRET
- META_REDIRECT_URI

## Redirect URL Rules
- Must exactly match deployed callback route
- HTTPS required for production
- Include local callback URL only for approved local test app

## Permission Targets
- pages_manage_posts
- pages_read_engagement
- pages_show_list
- instagram_basic
- instagram_content_publish
- instagram_manage_insights

## Sandbox Test Accounts
- Create at least one Facebook Page test path
- Ensure page links to Instagram business account
- Validate connect -> callback -> account persistence flow

## Validation Script (manual)
1. Click Connect Meta in Accounts page.
2. Complete consent flow.
3. Confirm redirect returns to app with connected status.
4. Confirm Facebook page account(s) appear.
5. Confirm linked Instagram account(s) appear.

## Completion Criteria
- Meta app exists and is configured with redirect URI
- Required permissions are set for review
- Sandbox account path validated end-to-end
- Connection flow evidence captured

## Evidence to Capture
- App settings screenshots
- Redirect URI settings screenshot
- Consent flow screenshots
- Connected accounts screenshot in MediaFox UI
