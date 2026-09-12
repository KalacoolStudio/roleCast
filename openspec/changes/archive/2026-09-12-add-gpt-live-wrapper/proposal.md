## Why

Role Cast currently accesses models through request/response Chat Completions, while `gpt-live-1` uses OpenAI's session-based Live API. A standalone wrapper will make voice transport and session control available for later integration without coupling provider events to the training engine.

## What Changes

- Add a JavaScript ESM workspace package, `@role-cast/gpt-live`, with an explicit public API for `gpt-live-1`.
- Wrap server-side WebSocket audio sessions, WebRTC offer/answer session creation, and server-side sideband connections to existing sessions.
- Expose session readiness, audio and transcript events, client-delegation notifications, context updates, and explicit session shutdown with finalization results.
- Default to client delegation so a future integration can retain Role Cast's existing orchestration and result validation. Allow callers to explicitly configure supported Responses delegation.
- Keep credentials in server-side constructor configuration; provide bounded startup/request/shutdown waits, cancellation, and sanitized errors.
- Provide offline protocol tests and usage examples explaining the future integration boundary.

## Capabilities

### New Capabilities

- `gpt-live-client`: A reusable server-side Live API client, transport lifecycle, event and audio contract, delegation hooks, and integration documentation.

### Modified Capabilities

None. The existing training UI, Chat Completions adapter, simulation lifecycle, reports, persistence, and runtime configuration retain their current behavior. Existing completed changes remain unarchived; this change does not modify their artifacts.

## Impact

Implementation will add `packages/gpt-live/` and `tests/gpt-live*.test.js`, update workspace dependency metadata and `package-lock.json`, and add a short README entry. The package will use an explicitly pinned OpenAI JavaScript SDK release with documented Live support and its required WebSocket dependency.

This change delivers the module only. It does not connect microphones, add UI or Fastify routes, wire Live into `Agents`/`Engine`, alter SQLite, or edit the user's `.env`. SIP, recording downloads, session forks, automatic reconnection, and a replacement implementation of Mastermind/Judge are out of scope.

The documented Live session and event contract is the compatibility target; a Chat Completions-compatible third-party endpoint does not establish Live compatibility. See [GPT-Live getting started](https://developers.openai.com/api/docs/guides/live) and [the requested model](https://developers.openai.com/api/docs/models/gpt-live-1).
