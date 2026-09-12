## 1. Package and configuration

- [x] 1.1 Add `packages/gpt-live/` with its ESM public exports, pin an OpenAI SDK release exposing the documented Live HTTP/primary/sideband APIs and the required WebSocket dependency, and update the root lockfile; verify installation and a package-name import on the supported Node runtime.
- [x] 1.2 Implement explicit client/session configuration and defaults with no environment loading or import-time networking; verify invalid settings fail locally, `gpt-live-1` remains the voice model, and client/Responses delegation settings are validated independently.
- [x] 1.3 Implement `GptLiveError` normalization and injectable SDK/transport construction; verify HTTP, socket, protocol, and nested Responses failures preserve safe classifications while secret sentinels do not appear in error messages, serialized fields, or causes.

## 2. Session creation and attachment

- [x] 2.1 Implement primary WebSocket connection startup, one startup message, early event subscription, and readiness on `session.started`; verify startup order, opaque IDs, authentication, and rejection of commands outside the ready state using controlled sockets and a loopback provider.
- [x] 2.2 Implement WebRTC offer exchange with explicit session configuration and projection to `{ sessionId, sdp }`; verify the real SDK's JSON request path/body, omitted WebSocket audio format, missing/malformed offers and responses, and absence of credentials in results.
- [x] 2.3 Implement sideband attachment with encoded opaque session IDs and independent local disconnect; verify the attach path, absence of a second startup command, rejected audio submissions, event observation, and detach without a remote close command.
- [x] 2.4 Implement finite HTTP/connect deadlines and startup AbortSignal handling with SDK retries disabled; verify pre-abort, cancellation during startup, timeout, transport error, and late-start races release resources and never create an automatic replacement session.

## 3. Audio, events, and control commands

- [x] 3.1 Implement PCM16LE input, base64 output decoding, and bounded outgoing transport buffering; verify byte round trips, invalid/partial samples, rejected malformed payloads, and explicit backpressure without silent loss or unbounded queues.
- [x] 3.2 Deliver transcript, delegation, usage, reflected-audio, and nested Responses events through the early subscription; verify preserved text/timestamps/IDs, overlapping fragments, absent optional event IDs, additive event types, and sanitized error delivery.
- [x] 3.3 Implement instruction/thinking/commentary appends, input mute/unmute, and the lower-level event-send method; verify wire event names, explicit delegation IDs or null, generated IDs, and lifecycle/sideband restrictions including reserved startup/close commands.
- [x] 3.4 Implement bounded pending-command correlation, acknowledgment/error settlement, timeouts, and cancellation; verify duplicate IDs, out-of-order acknowledgments, correlated versus uncorrelated errors, late acknowledgments, and cleanup without claiming remote cancellation.

## 4. Shutdown and regression verification

- [x] 4.1 Implement shared close results and terminal cleanup for explicit or provider-initiated finalization; verify one close command for repeated requests, rejection of new/pending work, final usage/reason preservation, and release after `session.closed`.
- [x] 4.2 Handle transport loss, shutdown timeout/abort, and local disconnect without confirmed finalization; verify classified incomplete results, unconfirmed latest usage, no automatic retry/reconnect, and no leftover timers, listeners, or pending promises.
- [x] 4.3 Add or complete loopback protocol coverage of the actual SDK adapter and package-isolation regression checks; verify the existing text adapter and runtime need no Live configuration and all new tests avoid real environment files and paid endpoints.

## 5. Documentation and delivery

- [x] 5.1 Write package usage documentation and WebSocket plus WebRTC/sideband examples against the exported API, then link the package from the root README; verify examples with controlled transports, cleanup paths, separate caller-owned credentials, delegation hooks, and explicit future transcript/playback integration responsibilities.
- [x] 5.2 Run `npm run build`, `npm test`, `npm run check`, and `openspec validate add-gpt-live-wrapper --strict`; record commands and results in the change's validation notes, distinguishing offline protocol coverage from unverified live-account/audio quality.
