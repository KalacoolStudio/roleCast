## Why

The conversation screen currently requires typing into「寫下你的回覆…」and pressing「送出」for every turn. The installed `@role-cast/gpt-live` wrapper can support a spoken Persona, but the application still needs microphone capture, playback, automatic transcript capture, and integration with its call lifecycle and Judge.

## What Changes

- Add「開始語音對話」beside the existing composer and a voice option when accepting a call. After one user gesture and microphone permission, `gpt-live-1` listens and speaks continuously; spoken replies require no submit button. Include mute, connection status, interruption handling, and「改用文字」.
- Reuse the existing wrapper through a server-owned primary WebSocket. Browser audio travels through a bounded application relay; the server supplies Persona context and forwards only public audio, captions, and status.
- Treat automatic submission as streaming microphone audio and recording speech automatically. Do not also post recognized text to `Engine.send`, which would generate a second Persona reply.
- Use natural speech while Judge evaluates in the background as the proposed voice behavior. A valid Judge stop immediately stops local playback/capture and ends the call. Speech already heard cannot be recalled. The existing text mode keeps its approval-before-publication behavior.
- Preserve source transcript fragments and stable evidence IDs; keep caption grouping separate from bounded transcript checkpoints used by Judge. No fragment gap is treated as an authoritative turn boundary.
- Bound continuous voice by a cumulative per-call duration budget (180 seconds by default). The existing 12-turn-style limits remain applicable to typed submissions; fragment/checkpoint counts do not consume those limits.
- Keep Mastermind planning between calls, Persona identity/fact boundaries, hangup, Recap, history, and final reporting across voice and text. Handle mode switches, denied permission, lost connections, refresh, and late results without duplicate sessions or replies.
- Reuse the existing server-only `API_KEY` for Live and text agents, with optional Live base URL/voice settings and legacy `LLM_API_KEY` compatibility for text-only setups. Add durable voice metadata, automated audio/protocol/browser fixtures, and setup documentation. No separate `OPENAI_API_KEY` is required or consumed.

## Capabilities

### New Capabilities

- `voice-conversation`: Browser voice controls, continuous bidirectional audio, server ownership, mode transitions, bounded lifecycle, and explicit configuration.
- `voice-evidence`: Transcript provenance and automatic speech checkpoints, continuous Judge observation, Persona assistance, call closure, and evidence-based history/reporting.

### Modified Capabilities

None in the current main spec tree: `openspec/specs/` is empty, and the implemented text and wrapper contracts remain in their completed, unarchived changes. The new requirements explicitly define voice-specific behavior alongside those contracts; prior change artifacts are not rewritten.

## Impact

Affected areas: `apps/web/src/main.jsx` and styles; new browser AudioWorklet/controller modules; `apps/server/src/{app,config,main}.js` and a voice coordinator/relay; `packages/core/src/{engine,agents,contracts}.js`; `packages/storage/src/store.js`; Vite's WebSocket proxy; server package dependencies; `.env.example`, README, and tests.

Use the existing `@role-cast/gpt-live` package and declare `ws` explicitly for the application relay. Add a transactional SQLite migration for voice source records and session metadata while retaining existing text messages. Real `.env` contents are not changed by setup or automated tests.

Non-goals: telephony, audio recording/replay, external tool execution, multiple simultaneous participants, voice cloning, automatic reconnection to a paid session, or changing the current text model. A real-account audio smoke test remains separate from offline verification.
