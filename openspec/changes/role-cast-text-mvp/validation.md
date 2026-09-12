# Implementation validation

Date: 2026-09-12

Environment: Node.js 26.7.0, npm 11.19.0, just 1.58.0, Linux.

## Automated checks

- `just test`: passed; production web build, 35 Vitest tests and 4 Playwright browser tests.
- `just check`: passed; ESLint and Prettier.
- `just --fmt --check`: passed.
- `openspec validate role-cast-text-mvp --strict`: passed.
- Lifecycle coverage includes anti-fraud StopCall, interview multi-call role changes and same-persona recall, report evidence, insufficient evidence, failure handling, cancellation races, duplicate requests, SQLite persistence and restart recovery.
- Browser coverage includes keyboard input, refresh without replay, connection recovery, readable completed/failed/interrupted history, and desktop/mobile layouts. Screenshots were visually reviewed.
- Provider tests use a local HTTP stub to verify request configuration, structured output validation, bounded retries, timeouts, cancellation and safe error messages. Test fixtures are injected only through test entry points.

## Operational checks

An isolated project copy excluded the user's `.env`, database and installed dependencies. With synthetic configuration, the documented setup was exercised from a fresh `npm ci` installation.

- `just` lists recipes; `just setup` installs dependencies and preserves an existing `.env`.
- `just dev` serves the API and Vite UI; Ctrl-C stops both processes. A separate supervisor test verifies sibling cleanup when one child fails.
- `just build` and `just start` serve the built UI and health endpoint; shutdown releases the port.
- `just status` succeeds while running and fails while stopped.
- README local links resolve. Client assets and the SQLite database do not contain the synthetic API key; error-response and logging tests also check for secret leakage.
- The isolated copy and its processes were cleaned up. The user's `.env` was not modified.

## Real provider smoke

Not executed: the local configuration did not contain all three required valid settings (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`). Automated model outputs establish application behavior, not real model quality or compatibility with a particular provider. Follow the README's real-model smoke checklist after configuring the provider.
