# Steam Community Integration Feasibility

Date: 2026-05-27
Owner: MediaFox engineering

## Objective
Determine practical options for integrating Steam-facing publishing workflows for game studio announcements and community updates.

## Summary Recommendation
- Direct automated posting to all Steam community surfaces is limited and depends on Valve partner capabilities.
- Best near-term path: build a Steam-assisted publishing workflow (structured content generation, link tracking, and task handoff) instead of assuming full API posting parity with social channels.
- Recommendation: GO for assisted workflow, CONDITIONAL GO for direct publish after partner validation.

## Surface Areas to Evaluate
- Steam News / Announcements
- Steam Community Events
- Store page update notes and patch notes workflows
- External links with campaign attribution

## Integration Modes

### Mode A: Assisted Publish (recommended first)
- MediaFox prepares Steam-ready copy blocks:
  - headline, short summary, long body, CTA links
- MediaFox stores a publish checklist and approval state.
- Team member finalizes publishing in Steamworks/Community UI.
- MediaFox captures publish URL and status manually for analytics continuity.

Pros:
- No dependency on uncertain API write permissions.
- Fast to ship and high practical value.

Cons:
- Manual final step by team user.

### Mode B: Direct Publish (conditional)
- Requires confirmation of Valve/partner API capability for the specific account and content type.
- Requires stable auth flow and write endpoints.
- Needs stricter retry and idempotency handling due to lower ecosystem observability.

Pros:
- Full automation if supported.

Cons:
- High unknowns until partner capability is confirmed.

## Technical Requirements for Mode A
- New channel type: steam_assisted (or workflow tag in post variant metadata).
- Steam-specific composer template with field validation:
  - headline length checks
  - markdown/rich text compatibility notes
  - image size guidelines
- Action log fields:
  - handoff_at
  - publish_url
  - published_by
  - published_at
- Optional reminder notifications if handoff remains unpublished > N hours.

## Technical Requirements for Mode B
- Partner auth and token handling strategy.
- Endpoint support matrix by content type.
- Publish status readback or confirmation hooks.
- Rate-limit and retry policy.

## Risks
- Platform capability uncertainty until partner-level validation.
- Policy variance between product pages and community surfaces.
- Manual process drift if assisted mode UX is weak.

## Mitigations
- Start with assisted mode and measurable workflow outcomes.
- Keep direct publish behind feature flag.
- Build clear publish checklist and completion prompts.

## Success Metrics
- % of Steam-targeted drafts that reach published state.
- Median time from approved content to Steam publish completion.
- Reduction in copy/paste and formatting errors.

## Go / No-Go
- Assisted mode: GO now.
- Direct publish mode: CONDITIONAL (pending verified partner capability).

## Suggested Next Steps
1. Build Steam-assisted workflow in composer and calendar.
2. Add publish URL capture and status tracking.
3. Open partner validation track for direct publish feasibility.
