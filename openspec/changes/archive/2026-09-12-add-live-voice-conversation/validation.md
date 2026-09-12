# Validation — add-live-voice-conversation

Date: 2026-09-12. Environment: Node.js 26.7.0, npm 11.19.0, Linux, Playwright Chromium.

## Automated results

| Check | Result |
| --- | --- |
| `npm run build` | Passed; browser AudioWorklet emitted as a bundled asset |
| `npm test` | Passed: 160 Vitest tests across 12 files and 10 Playwright browser tests |
| `npm run check` | Passed: ESLint and Prettier |
| `openspec validate add-live-voice-conversation --strict` | Passed |
| `git diff --check` | Passed |

Tests use temporary SQLite, injected agents/Live connections, synthetic microphone input, and local HTTP/WebSocket servers. No automated test reads real credentials or contacts a paid model endpoint. Loopback networking and Chromium were run with sandbox permission for local listeners.

## Coverage

- `voice-storage.test.js`: optional configuration and precedence; fixed Live wire defaults; scoped identity/history; exact whitespace, overlap, repeated speech, duplicate IDs, late fragments, Unicode splitting and immutable source spans; foreign keys; version-1 text preservation through schema-2 migration and restart sealing of durable pending fragments.
- `voice-core.test.js`: voice-first greeting and early events; text/voice exclusion; independent coalesced Judge work; final Judge draining on mode change; failed/invalid evaluation; scoped, deduplicated, bounded assistance; single-stop Recap and stale-result rejection; cumulative duration including mute and repeated attempts; typed-turn accounting; reservation expiry/replay; provider authentication/heartbeat failures; bounded close and late startup disposal; queue overflow.
- `voice-relay.test.js`: real loopback WebSocket attachment/PCM ordering; exact origins and owner conflicts; invalid controls/PCM; private-event projection; tab loss; configured Vite WebSocket proxy.
- `voice-media.test.js`: actual worklet processing at 24/44.1/48 kHz; streaming phase continuity and PCM16LE values; concurrent capture/playback without microphone monitoring; muted silence; 250 ms playback and bounded worklet/transport queues; device/audio/permission/setup failure cleanup; late permission cancellation; stale attempt isolation.
- `voice-captions.test.js`: growing display groups, overlapping speakers, delayed sources, exact checkpoint references, and no duplication when polling catches up with live events.
- `browser/voice.spec.js`: real Chromium AudioContext/AudioWorklet with synthetic microphone; voice-first and composer entry; automatic captions/audio without submit; mute/unmute; same-call text continuation; Judge/Persona/duration termination; exact report anchors; permission denial; provider loss; explicit retry; reload/navigation cleanup without automatic reacquisition; preserved reading position.
- Existing core, runtime, provider, supervisor, wrapper/SDK, example, desktop, mobile, and text-flow tests remain passing.

## Local application state and unverified checks

Following the requested shared-credential refactor, a configuration-only inspection confirmed that both text and Live use the existing `API_KEY`. `OPENAI_API_KEY` is no longer consumed. The owned development servers were restarted; the frontend, proxied health endpoint, and proxied capabilities endpoint returned HTTP 200, with voice available for `gpt-live-1`. Real `.env` contents were neither modified nor printed, and no paid model request was made.

## Shared-key refactor validation

- `npm run test:unit -- tests/runtime.test.js tests/voice-storage.test.js tests/supervisor.test.js`: 12 tests passed. These cover an `API_KEY`-only setup, process-environment precedence, preference over legacy/obsolete keys, legacy text-only compatibility, invalid optional voice settings, safe capability reporting, preserved `.env` files, and development-server lifecycle. The supervisor subprocess tests passed with the required sandbox permissions.
- `npm run check`, `openspec validate add-live-voice-conversation --strict`, and `git diff --check`: passed.
- The full 160-unit/integration and 10-browser results above are from the initial voice implementation. This credential-only follow-up used the affected configuration/runtime/supervisor checks; browser behavior and audio transport code were unchanged.

Live account/model access, physical microphone compatibility, real Traditional Chinese recognition/speech quality, natural interruption behavior, echo cancellation, and end-to-end latency remain unverified. The README contains a separate real-device checklist. Synthetic media and injected provider transcripts establish integration behavior, not model or audio quality.

At initial implementation, this change was left ready for a separate archive operation. The integration and consolidation below supersede that earlier workflow status.


## Main-branch integration validation — 2026-09-12

The branch was integrated with main's customizable plots, drill snapshots, live stage, and structured agent output contracts. The current database version is 4; the earlier schema-2 description above records the original voice-only implementation.

- `npm test`: all 196 Vitest tests across 14 files passed. The browser portion initially exposed a transcript-scrolling integration failure.
- After fixing the scroll container and rebuilding with `npm run build`, `npm run test:e2e`: all 17 Playwright tests passed, including plot editing, stage synchronization, voice controls, and caption reading position. The browser fixture serves built assets, so rebuilding is necessary after frontend changes.
- `npm run check` and `git diff --check`: passed.
- `openspec validate --all --strict`: all six completed changes and ten consolidated capability specs passed before archive.

New regression coverage verifies actual voice-version-2 and main-version-3 table layouts, atomic migration failure, retained plot definitions and event sequences, recovery of pending speech, and repeated restarts without duplicate evidence or interruption events. Stage tests verify that caption checkpoints publish snapshot revisions without inventing semantic turns. Provider tests verify empty voice-assistance context under the strict output envelope, local context limits, and role-prompt isolation. Relay tests cover both drill and legacy session routes and same-host HTTPS origin checks without trusting forwarded host headers.

Validation uses temporary databases, loopback servers, and synthetic media. No paid requests or real `.env` changes were made, and no development server was started. Real device and provider access limitations remain as listed above.
