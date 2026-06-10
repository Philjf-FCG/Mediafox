# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install
npm test
npm run build   # compiles TypeScript → dist/
npm run dev     # port 5004
```

## Architecture Overview

MediaFox is a **social media management** platform. Node.js/Express service.

- Port: 5004 | Health: `GET /api/health` | Cloud Run name: `fox-mediafox`
- Auth: FoxAuth JWT (verifies `FOXAUTH_JWT_SECRET` locally)
- Platform adapters in `dist/adapters/`: Slack, Discord, Facebook, Instagram, LinkedIn, YouTube, Bluesky
- Scheduled jobs in `dist/scheduler/`: analytics sync, inbox polling, token refresh, archive retention
- Media files stored at `MEDIA_STORAGE_PATH`

**Critical secrets:**
- `FOXAUTH_JWT_SECRET` — shared JWT verification
- `MEDIAFOX_TOKEN_ENCRYPTION_KEY` — encrypts stored platform OAuth tokens (at-rest encryption for social media API keys)

The `dist/` directory IS committed (no TypeScript toolchain needed at deploy time).
Edit source in `src/`, then `npm run build` before committing.

See `../CLAUDE.md` (root) for GCP project details.

## Conventions & Patterns

- Platform adapters follow a common interface — see existing adapter for pattern
- Never store raw OAuth tokens in the DB without encrypting via `TOKEN_ENCRYPTION_KEY`
- Structured JSON logging — see `../fox-suite/monitoring/LOGGING_GUIDE.md`
