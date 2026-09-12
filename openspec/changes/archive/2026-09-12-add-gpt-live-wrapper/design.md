## Context

See [proposal.md](proposal.md) for motivation and [the capability contract](specs/gpt-live-client/spec.md) for required behavior.

The repository uses Node.js >=22.12, JavaScript ESM, npm workspaces, and Vitest. `packages/core/src/agents.js` currently performs five bounded Chat Completions operations and validates JSON before returning results to `Engine`. `tests/provider.test.js` already demonstrates loopback HTTP provider tests and secret-sentinel assertions. The frontend uses REST polling; there is no audio transport or Live dependency.

Official documentation checked on 2026-09-12 identifies a distinct Live session protocol. Its streaming behavior does not supply the existing engine's discrete, validated user/assistant turns. A separate package therefore avoids pretending the current `Agents.run()` contract can be satisfied by changing the model name.

## Goals / Non-Goals

**Goals:** Define a small server-only public API, keep transport-specific startup explicit, expose provider events without inventing training semantics, and make cleanup and protocol behavior testable offline.

**Non-Goals:** See the proposal for product exclusions. In particular, this module will not decide what constitutes a user turn, execute delegated tasks, or determine which generated speech the participant may hear. It will not abstract multiple voice providers or implement a browser media stack.

## Decisions

### 1. Workspace package around the official SDK

Add `packages/gpt-live/package.json` with name `@role-cast/gpt-live`, `type: module`, and an `exports` entry pointing at `src/index.js`. Keep client creation, connection lifecycle, and error normalization in small internal modules. Use JavaScript and JSDoc; no compilation step.

Pin `openai` 7.15.0 and `ws` 8.21.3 in this package and lock them through the existing root lockfile. The inspected SDK exposes `client.live.create`, `LiveWS`, and `SidebandWS`. SDK imports and connection construction remain behind an injectable transport adapter, so tests can control event timing while loopback tests exercise the real wire adapter.

Using the SDK retains its documented headers and serialization. Handwriting the entire protocol would add maintenance; adding Live to the AI SDK Chat Completions adapter would conflate incompatible lifecycles. The wrapper's public API does not expose SDK instances or raw SDK errors.

The adapter takes ownership of event parsing and lifecycle listeners on its private SDK-created Node socket. This bounds incoming frames to 16 MiB, rejects non-object/binary protocol frames safely, and allows deterministic local termination without SDK raw-event logging or reconnection. Explicit settings disable SDK environment overrides; the pinned SDK's `OPENAI_CUSTOM_HEADERS` merge is cleared on the private client. These implementation details depend on the pinned version and have actual-SDK loopback coverage.

### 2. Public API and configuration

Export `createGptLiveClient` and `GptLiveError`. The proposed public surface is:

| Entry point | Result and responsibility |
| --- | --- |
| `createGptLiveClient(config, dependencies?)` | Side-effect-free client construction with explicit server credentials |
| `client.connectWebSocket(sessionOptions, { signal, onEvent })` | Promise of a ready primary `LiveConnection` |
| `client.createWebRtcSession({ sdp, ...sessionOptions }, { signal })` | `{ sessionId, sdp }`, projected from the provider response |
| `client.attach(sessionId, { signal, onEvent })` | Promise of an attached control `LiveConnection` |
| `connection.appendAudio(bytes)` | Queue one validated PCM chunk on a primary connection |
| `connection.appendInstructions(content, options)` | Await correlated instruction acknowledgment |
| `connection.appendThinking(content, options)` | Await correlated quiet-context acknowledgment |
| `connection.appendCommentary(content, options)` | Await correlated commentary acknowledgment |
| `connection.muteInput(options)` / `unmuteInput(options)` | Await the corresponding command acknowledgment |
| `connection.sendEvent(event)` | Send another documented Live command and return its event ID; does not await acknowledgment |
| `connection.close({ signal })` | Shared promise of `{ finalized: true, sessionId, reason, usage }` |
| `connection.closed` | The same finalization promise, observable before a local close request |
| `connection.disconnect()` | Release the local socket immediately; never represent this as confirmed remote finalization |

`config` requires `apiKey`, accepts `baseURL`, and sets finite request/connect/command timeouts (30 seconds each by default), close timeout (15 seconds), outgoing buffer limit (1 MiB), and pending-command limit (64). Accept HTTPS base URLs and loopback HTTP for fixtures; reject credentials, query strings, and fragments. Preserve a supplied version-path prefix. Never use process environment or `.env` as package configuration.

Session options contain `instructions`, `input`, `voice`, `delegation`, and `store`. Always use the requested `gpt-live-1`; changing voice models is outside this package's initial contract. Default `input` to `[]`, voice to `marin`, delegation to `{ type: "client" }`, and `store` to `false`. Validate configuration without printing values. Allow supported Responses configuration only when callers provide its backend model explicitly. Keep it separate from the voice model.

Examples can read `OPENAI_API_KEY` in caller code and pass it into the constructor. The current `LLM_*` configuration remains independent. A custom Live-compatible endpoint is an explicit caller choice, with no automatic fallback or credential forwarding to another provider.

### 3. Distinct startup paths

| Path | Provider interaction | Ready condition |
| --- | --- | --- |
| Primary WebSocket | `/v1/live/sessions`; SDK authentication; one `session.start` | Valid `session.started` with opaque ID |
| WebRTC creation | JSON POST to `/v1/live/sessions` with `session` and `transport: { type: "webrtc", sdp }` | HTTP exchange complete; browser still waits for its own `session.started` |
| Sideband | `/v1/live/sessions/{session_id}/attach` through the SDK | Authenticated control socket open; no new `session.start` |

Opaque IDs are validated as nonempty values and encoded as single path segments without interpreting or rewriting their prefixes. Sideband attachment does not promise historical event replay. WebRTC creation projects only `session.id` and `transport.sdp`; session configuration is not returned to the browser by this wrapper. Omit `audio.format` for negotiated WebRTC media. The REST create response alone does not prove media readiness. [WebRTC setup](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [sideband controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).

Register internal event processing and the supplied `onEvent` callback before opening either socket so the startup interval cannot drop transcript or terminal events. Separate `connecting`, `starting` (primary only), `ready`, `closing`, and terminal local states. `connectWebSocket`/`attach` signals govern their initialization only. Once returned, the handle is controlled with command signals, `close`, or `disconnect`.

### 4. Audio and events

Use PCM16LE mono 24 kHz for the primary convenience API. `appendAudio` accepts nonempty `Buffer`/`Uint8Array` data with complete 16-bit samples, encodes it as base64, and sends `session.input_audio.append`. The caller supplies already sampled audio and timing; WAV containers, resampling, codecs, microphone capture, and playback are outside the package. Measure the encoded frame against the configured buffer allowance before sending. Reject excess with `LIVE_BACKPRESSURE`; do not add an unbounded application queue.

Deliver protocol events with their original fields through `onEvent`, except errors, which are normalized. Keep base64 audio in those events; export a tested `decodeAudio` helper returning bytes so consumers can choose decoding. Preserve transcript whitespace, intervals, nested Responses data, and additive fields. A missing optional event ID is valid for reflected sideband audio. Sideband audio submission is rejected even through `sendEvent`; reflected audio does not give that socket permission to transmit media. [Primary streaming](https://developers.openai.com/api/docs/guides/voice-websockets?api=live), [reflected sideband audio](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).

Do not accumulate unlimited transcript/audio history inside the library. Consumers own storage and keep handlers short. A future integration must define its own turn grouping and playback policy; receipt of text or an acknowledgment establishes neither a complete training turn nor what was heard.

### 5. Commands and delegation remain caller controlled

Convenience appends take `{ delegationId: null, signal, eventId }` options, with a caller-provided opaque delegation ID supported. Map their names to `session.instructions.append`, `session.thinking.append`, and `session.commentary.append`. Assign an outgoing event ID if absent and register a pending acknowledgment before sending. Match the expected acknowledgment's `client_event_id` or the error's correlated client ID; unrelated and late acknowledgments must not settle another command.

Keep a bounded pending-command map (64 by default), remove entries and abort listeners on completion, and reject duplicate in-flight IDs. An uncorrelated provider error is emitted but does not mark every pending command successful or automatically terminate a valid session. Timeouts and aborts cancel local waiting; a command already transmitted can still take effect remotely. The lower-level send operation makes no acknowledgment promise and enforces the same readiness, shutdown, and transport restrictions. Reserve startup/close events for lifecycle methods so the escape hatch cannot bypass them.

In client delegation, forward the notification for the caller to combine with its transcript and task state. The package sends no automatic backend request. Optional Responses mode exposes nested events and lower-level command access, without a built-in tool executor. This leaves future ownership and stale-result checks in Role Cast. [Delegation contract](https://developers.openai.com/api/docs/guides/live-delegation).

### 6. Finalization, cancellation, and errors

Use one idempotent finalization path for natural terminal events and explicit close. Install terminal listeners at connection creation. On `close`, reject further submissions, reject pending command waits with a closing-state error, and send one `session.close`. Continue delivering events until `session.closed`; capture its reason and final usage, then release the socket, timers, and listeners. A terminal reason such as `connection_lost` can still carry confirmed final usage. Keep cumulative usage snapshots as snapshots, without summing them.

Without the final event, reject with `LIVE_FINALIZATION` and attach only safe metadata such as `finalized: false`, failure category, and the latest unconfirmed usage. For a sideband, `disconnect` only detaches control. For a primary, it abandons the transport without claiming successful finalization. The caller remains responsible for browser tracks and delegated jobs. [Session finalization](https://developers.openai.com/api/docs/guides/live-conversations).

Disable SDK retries (`maxRetries: 0`); do not retry any session creation or command, including 429/5xx, automatically. Normalize failures into `LIVE_CONFIG`, `LIVE_INPUT`, `LIVE_AUTH`, `LIVE_REQUEST`, `LIVE_RATE_LIMIT`, `LIVE_UNAVAILABLE`, `LIVE_CANCELLED`, `LIVE_TIMEOUT`, `LIVE_PROTOCOL`, `LIVE_STATE`, `LIVE_BACKPRESSURE`, and `LIVE_FINALIZATION`. Error objects expose only fixed messages and allowlisted safe metadata. Never retain raw response bodies, SDK exceptions as causes, request objects, or headers on exported errors. Normalize HTTP failures, socket errors, protocol `error` events, and nested Responses failures consistently.

### 7. Verification and future integration guide

Place tests under `tests/gpt-live*.test.js` so the existing Vitest include picks them up. Inject sockets for deterministic event races and deadlines; use a loopback HTTP/WebSocket provider to verify the real SDK's paths, authentication, create body, startup messages, and attachment. Exercise the spec's cancellation, command correlation, backpressure, malformed data, late-event, secret-redaction, and finalization scenarios. No automated test imports real environment configuration.

The package README will show primary audio streaming and WebRTC offer exchange plus sideband controls using the exact exported API. Include `try/finally` cleanup, explain operation signals, and show client delegation with a caller-supplied backend function. Explain that later integration requires a deliberate mapping between training call IDs and Live session IDs, authorized Persona context, transcript storage, Judge intervention, and application-controlled playback if speech must wait for validation. This change does not establish that mapping.

## Risks / Trade-offs

- SDK and Live protocol evolution → pin versions, cite verified documentation, and test the actual adapter with loopback fixtures while preserving additive events.
- Current credentials might belong to a Chat Completions provider → require separate explicit Live configuration and report account access as unverified until an opt-in smoke test.
- A lost creation response can leave remote initialization uncertain → perform no automatic retry; document the uncertainty and attach for explicit session closure when a usable ID is known.
- Fast audio/event callbacks can overwhelm application consumers → bound outgoing data and pending commands; retain no unbounded event history.
- Direct speech can precede Judge approval → document that future playback integration must enforce that policy; the wrapper supplies events and controls only.

## Migration Plan

Add the isolated package and dependencies, run the new tests and existing validation, and document imports. No database migration, `.env` modification, or runtime activation is required. Removing the package, its dependency entries, and the documentation entry reverses the change. Leave this OpenSpec change available for review and later archival after implementation.
