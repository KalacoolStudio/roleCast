# Validation

Date: 2026-09-12. Environment: Node.js 26.7.0, Linux.

- `just test`: passed (production frontend build, 41 Vitest unit/integration tests, 6 Playwright browser tests).
- `just check`: passed (ESLint and Prettier).
- `git diff --check`: passed.
- `openspec validate customizable-plots-and-drills --strict`: passed.
- Plot contract tests cover missing/oversized fields, duplicate fact IDs/keys, duplicate criteria, unsupported imports and JSON round trip.
- Persistence tests cover plot updates across restart, optimistic version conflicts, non-overwriting seeds, and migration of v1 completed/active drills while retaining IDs, messages, reports and saved operation prompts.
- Core tests verify operation-specific Mastermind/Judge/Reporter instructions, Persona isolation, Reporter evidence-only context, immutable drill configuration after plot edits, and continued rejection of invalid evidence despite author instructions.
- HTTP tests cover canonical plot/drill APIs, old session/scenario compatibility, validation failures, request size limits and public projections without private prompts.
- Browser tests cover creating and copying plots, editing all three prompts, export/import through actual files, starting a drill from an imported plot, invalid imports and draft retention/reload after an external version conflict. Existing lifecycle, refresh, cancellation, history and report flows continue to pass.
- Desktop and 390 px mobile editor screenshots were reviewed; responsive layout has no horizontal overflow. Long fact and criterion fields use multiline controls.
- README local links and `examples/customer-support.plot.json` import were verified. `.env` remains ignored and was not modified by this change.

All model behavior in automated tests uses controlled fixtures or a local HTTP provider stub. No paid model request was sent for this change; semantic adherence of custom prompts remains part of the README's real-provider smoke checklist. The user's running server was not restarted; restart `just dev` to load the new backend and perform the SQLite migration.
