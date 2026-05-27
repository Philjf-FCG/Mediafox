# X and Threads Integration Feasibility

Date: 2026-05-27
Owner: MediaFox engineering

## Objective
Assess API access, policy constraints, technical complexity, and expected product value for adding X and Threads as supported channels.

## Executive Summary
- X: Feasible with medium-to-high commercial risk due to pricing and policy volatility.
- Threads: Feasible for publishing and insights via Meta ecosystem with lower policy risk if app review scopes are approved.
- Recommendation: Prioritize Threads before X for predictable ROI and operational stability.

## Evaluation Criteria
- API availability and access tier requirements
- OAuth and account connection complexity
- Publish capability and media support
- Rate limits and reliability concerns
- Analytics and inbox support potential
- Compliance and moderation policy overhead
- Cost predictability

## Platform Assessment

### X (Twitter)
Access and policy:
- Public APIs are available but core write access may require paid tier and elevated app permissions.
- Policy and pricing can change rapidly, creating planning and margin risk.

Technical implementation:
- OAuth 2.0 with PKCE is available for user-level auth.
- Posting text/media and reading post metrics is technically straightforward once entitlement is granted.
- Inbox/DM workflows are significantly more complex than posting and may require separate scope approvals.

Operational risk:
- High risk of cost drift and feature gating changes.
- Requires robust provider health monitoring and graceful degradation for entitlement failures.

Expected value:
- High audience value for games and announcements.
- Good fit for short release updates and community broadcast.

Recommendation:
- Proceed only if acceptable monthly API budget is approved.
- Ship as optional paid add-on integration tier in MediaFox plans.

### Threads
Access and policy:
- Threads APIs run through Meta ecosystem and are generally more predictable than X.
- Requires Meta app setup, permissions, and app review flow similar to Instagram/Facebook stack.

Technical implementation:
- OAuth and token handling can reuse existing Meta integration patterns.
- Publishing support can be delivered first; engagement and analytics follow in phase 2.
- Team-owned business identities align with existing account model.

Operational risk:
- Moderate app review friction, lower ongoing pricing volatility compared to X.

Expected value:
- Strong fit for game studio dev updates and community engagement.
- Good cross-post complement to Instagram/Facebook.

Recommendation:
- Implement Threads publishing next after current security roadmap is complete.

## Delivery Recommendation
Order:
1. Threads Phase 1: connect + publish + status tracking
2. Threads Phase 2: analytics + inbox ingestion where API supports it
3. X Phase 0: commercial and legal gate check
4. X Phase 1: optional paid-channel beta if approved

## Proposed Technical Approach

### Shared requirements
- Reuse secure OAuth state signing and callback validation patterns.
- Reuse account token encryption and token-expiry handling.
- Add channel capability matrix to prevent unsupported actions in UI.

### Threads implementation slices
- Slice A: account connect and token storage
- Slice B: text and media publish
- Slice C: post status and failure diagnostics
- Slice D: analytics sync job

### X implementation slices
- Slice A: entitlement preflight and app-tier checks
- Slice B: account connect and token storage
- Slice C: text/media publish with strict rate limit handling
- Slice D: analytics ingest and health telemetry

## Risks and Mitigations
- Risk: API pricing changes (X)
  - Mitigation: feature flag, per-studio quota, paid integration add-on.
- Risk: app review delays (Threads)
  - Mitigation: parallel prep of review assets and sandbox test scripts.
- Risk: policy violations from user content
  - Mitigation: pre-publish policy checks and per-channel warning UX.

## Go / No-Go Recommendation
- Threads: GO
- X: CONDITIONAL GO (requires approved budget and legal sign-off)

## Next Actions
- Create implementation epic for Threads with phased milestones.
- Add commercialization decision checkpoint for X before coding.
- Prepare Meta and X app review artifacts in advance.
