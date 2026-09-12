# @role-cast/gpt-live

Server-side JavaScript ESM wrapper for OpenAI's **Live API** and `gpt-live-1`. It provides primary WebSocket audio, WebRTC SDP exchange, and sideband control. It is an independent workspace package; the existing Role Cast text flow remains separately configured.

Requires Node.js **22.12+**. Run `npm ci` at the repository root to install the workspace. The package pins `openai` 7.15.0 and `ws` 8.21.3 and needs no build step.

## Create a client

```js
import {
  createGptLiveClient,
  GptLiveError,
  decodeAudio,
} from "@role-cast/gpt-live";

const live = createGptLiveClient({
  apiKey: process.env.OPENAI_API_KEY, // Read by your server, explicitly passed in.
});
```

Importing and constructing a client do not connect, load `.env`, access SQLite, or read Role Cast's `LLM_*` configuration. Your server owns environment loading and credentials. Keep this package and the key on the server; return only the WebRTC answer/ID to an authorized browser. A configured text provider does not establish Live API access.

| Client setting       | Default                     | Meaning                                                                   |
| -------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `apiKey`             | Required                    | Explicit server credential                                                |
| `baseURL`            | `https://api.openai.com/v1` | HTTPS API root, including any version prefix; loopback HTTP also accepted |
| `requestTimeoutMs`   | `30000`                     | Complete WebRTC HTTP exchange, including response body                    |
| `connectTimeoutMs`   | `30000`                     | WebSocket/sideband initialization                                         |
| `commandTimeoutMs`   | `30000`                     | One convenience-command acknowledgment                                    |
| `closeTimeoutMs`     | `15000`                     | Wait for `session.closed`                                                 |
| `maxBufferedBytes`   | `1048576`                   | Outgoing buffered bytes plus the next encoded command                     |
| `maxPendingCommands` | `64`                        | Outstanding convenience-command waits                                     |

Limits must be positive safe integers no greater than `2147483647`. Base URLs cannot contain credentials, query strings, or fragments. Requests use only the explicit client settings; SDK credential/header/logging environment overrides are disabled. The wrapper does not retry requests or reconnect sockets automatically.

## Session options

Both `connectWebSocket(session, operation)` and `createWebRtcSession({ sdp, ...session }, operation)` accept:

```js
const session = {
  instructions: "請用繁體中文進行簡短的後端工程師面試。",
  input: [
    {
      role: "user",
      content: [{ type: "input_text", text: "我有三年工作經驗。" }],
    },
  ],
  voice: "marin",
  delegation: { type: "client" },
  store: false,
};
```

The voice model is fixed to `gpt-live-1`. Defaults are empty history, `marin`, client delegation, and `store: false`. History supports up to 128 text messages with `developer`, `user`, or `assistant` roles and one text content part per message. Assistant parts may use `text` or `output_text`; other roles use `input_text`. A custom voice may be supplied as `{ id: "your-voice-id" }`. Configuration is copied before networking.

Provider recording is disabled by default. Inference still sends session context and audio to the configured provider. Quiet thinking context can influence spoken output; do not put credentials there.

To opt into the provider's Responses backend, supply its model explicitly:

```js
const delegation = {
  type: "responses",
  responses: {
    model: "your-supported-responses-model",
    instructions: "Use the application's authorized task context.",
    max_output_tokens: 512,
    tools: [{ type: "web_search" }],
  },
};
```

The backend model is separate from the voice model. Supported Responses settings are `model`, `instructions`, `max_output_tokens`, `parallel_tool_calls`, `reasoning`, `service_tier`, `text`, `tool_choice`, and `tools` (function or web search tools). Model-specific compatibility is checked by the provider. No tool executor is included.

## Primary WebSocket example

The tested [WebSocket example](examples/websocket.js) connects with an early subscription, routes output audio/transcripts, runs caller-owned interaction, and awaits finalization in `finally`:

```js
// Example helper import is relative to the repository root.
import { withWebSocketVoice } from "./packages/gpt-live/examples/websocket.js";

const final = await withWebSocketVoice(
  live,
  {
    session,
    signal: startupController.signal,
    onAudio: (pcm) => playback.enqueue(pcm),
    onTranscript: (event) => transcriptStore.appendFragment(event),
    onEvent: (event) => application.receiveLiveEvent(event),
  },
  async (connection) => {
    // These application objects are supplied by your integration.
    // End this iterable when the participant intentionally ends the conversation.
    for await (const pcm of microphone.chunks()) connection.appendAudio(pcm);
  },
);
// final: { finalized: true, sessionId, reason, usage: { seconds } }
```

`microphone`, `playback`, `transcriptStore`, `application`, and controllers are caller-owned; the example does not implement media capture or a UI. The callback receives a ready connection only after `session.started`. Output audio and transcript callbacks receive those respective events; the example's `onEvent` receives the remaining events, including delegation and errors.

Input must be **raw mono PCM16LE at 24 kHz**, supplied as a nonempty `Buffer` or `Uint8Array` containing whole 16-bit samples. No WAV headers, resampling, capture timing, or playback are supplied. `appendAudio` synchronously returns the sent event ID. `decodeAudio(base64)` validates and returns a PCM `Buffer`; raw clients use it on `session.output_audio.delta.delta`.

`LIVE_BACKPRESSURE` means that submission was rejected before sending. The caller must pause capture or apply its own bounded buffering policy. There is no hidden retry queue. Do not enqueue an entire recording in a tight loop. The caller also decides when playback has finished before ending interaction; receiving output is not proof it was heard.

## WebRTC offer exchange and sideband example

In your server's offer handler, exchange the browser's SDP using an authorized session configuration:

```js
const answer = await live.createWebRtcSession(
  { sdp: browserOfferSdp, ...session },
  { signal: requestController.signal },
);
// Return only answer to the browser: { sessionId, sdp }.
```

The browser applies `answer.sdp` as its remote answer and waits for `session.started` on its data channel. HTTP success alone is not media readiness. WebRTC creation starts the session; do not send another `session.start`. The wrapper omits the WebSocket-specific `audio.format` for negotiated WebRTC media. Browser peer setup, tracks, data channels, offer-handler authorization, and playback are integration responsibilities.

Keep the returned ID before attaching, so a failed attachment does not discard it. The tested [sideband example](examples/webrtc.js) scopes a control connection independently of the media connection:

```js
import { withSideband } from "./packages/gpt-live/examples/webrtc.js";

await withSideband(
  live,
  answer.sessionId,
  { onEvent: (event) => application.receiveLiveEvent(event) },
  async (control) => {
    await control.appendInstructions("Keep each question brief.");
    await application.untilControlIsNoLongerNeeded();
    // To end the remote session too, explicitly await control.close() here.
  },
);
```

The helper always calls `disconnect()` on exit; this only detaches the sideband. `attach` resolves when the authenticated control socket opens, sends no startup command, and does not promise historical event replay. Session IDs are opaque and encoded as one path segment. Sidebands cannot submit audio. The caller owns browser cleanup and must explicitly end remote sessions when needed. A lost HTTP creation response can leave remote creation uncertain; the wrapper does not retry it.

## Connections, events, and delegation

For direct use, call `live.connectWebSocket(session, { signal, onEvent })` or `live.attach(sessionId, { signal, onEvent })`. Both return a connection with `state`, `sessionId`, `mode` (`primary` or `sideband`), and a `closed` promise. Install `onEvent` when connecting: it can run before the connection promise resolves. Deliver events to your own bounded application dispatcher if processing requires the returned handle.

| Connection method                             | Result                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| `appendAudio(bytes)`                          | Event ID; primary only, no acknowledgment wait                 |
| `appendInstructions(content, options)`        | Promise of matching `session.instructions.appended`            |
| `appendThinking(content, options)`            | Promise of matching `session.thinking.appended`                |
| `appendCommentary(content, options)`          | Promise of matching `session.commentary.appended`              |
| `muteInput(options)` / `unmuteInput(options)` | Promise of matching input mute/unmute acknowledgment           |
| `sendEvent(event)`                            | Event ID; caller handles provider events                       |
| `close({ signal })`                           | The same shared finalization promise on every call             |
| `disconnect()`                                | Immediate local cleanup, without confirmed remote finalization |

Append options are `{ delegationId = null, eventId, signal }`; mute/unmute options are `{ eventId, signal }`. Append content must be nonempty text. Omitted IDs are generated. Convenience commands correlate matching acknowledgment types and `client_event_id`; a correlated provider error rejects only that command. `sendEvent` accepts other documented commands such as `response.item.create` and `response.create`, but reserves `session.start` and `session.close` for lifecycle handling. It does not create a pending acknowledgment wait.

Use `session.delegation.created` notifications with your own backend. A delegation contains an ID, target, and timing metadata, **not task text**. For example, inside your application dispatcher after obtaining a connection:

```js
const { delegation } = event;
if (delegation.target === "client") {
  const context = application.contextFor(delegation); // Transcript + authorized task state.
  const result = await runBackend(context); // Caller-supplied function.
  if (connection.state === "ready" && application.isCurrent(delegation.id)) {
    await connection.appendThinking(result, { delegationId: delegation.id });
    // Use appendCommentary when the result is intended as spoken commentary.
  }
}
```

The caller schedules and cancels delegated jobs, decides their task, and rejects stale results. An append acknowledgment confirms acceptance, not spoken delivery. Responses mode forwards `response.event` with the original delegation envelope and nested event; granular function-call events can drive your own executor. Submit its results with documented `response.item.create` and `response.create` commands.

Events retain transcript whitespace, timestamps, IDs, overlapping fragments, and additive event types. Reflected audio may omit event IDs. `session.usage.updated` is a cumulative snapshot; do not sum snapshots. The wrapper retains no transcript history and creates no turn-completed or audio-played events.

Callbacks run as events arrive; asynchronous callbacks are not serialized and provide no incoming backpressure. Keep them small. A thrown error or rejected callback promise terminates the local connection with a safe error. Remote error payloads are replaced by `GptLiveError`. Flat Responses errors become `{ type: "error", sequence_number, error: GptLiveError }` inside the original envelope. Raw provider messages, codes, parameters, and causes are not exposed; correlate convenience commands using their returned promises.

## Cancellation, finalization, and failures

Startup signals apply only until `connectWebSocket` or `attach` resolves. After readiness, use command signals, `close`, or `disconnect`. Cancelling a command wait does not undo a command already sent. All waits have finite deadlines; no session creation, command, or attachment is automatically retried.

`close()` rejects new/pending work, sends one `session.close`, and continues receiving events until `session.closed`. On that event, `closed` and `close()` resolve to `{ finalized: true, sessionId, reason, usage: { seconds } }`, even for an abnormal provider reason. Inspect `reason`. The wrapper releases its socket, listeners, timers, and pending waits on all terminal paths.

Without `session.closed`, finalization rejects with `LIVE_FINALIZATION`, `finalized: false`, a `failureCode`, and optional `latestUsage` that is **unconfirmed**. A socket close, timeout, abort, or local disconnect is not final usage. Observe `connection.closed` to detect provider-initiated termination even if you have not requested close. Repeated close calls retain the same result; the first close call owns cancellation.

Public errors have fixed messages and safe metadata, without raw SDK errors or causes:

| Code                                   | Meaning                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `LIVE_CONFIG` / `LIVE_INPUT`           | Invalid local configuration or command/audio            |
| `LIVE_AUTH`                            | Authentication or permission failure                    |
| `LIVE_REQUEST`                         | Provider rejected the request                           |
| `LIVE_RATE_LIMIT` / `LIVE_UNAVAILABLE` | Rate limit, service, or transport failure               |
| `LIVE_CANCELLED` / `LIVE_TIMEOUT`      | Local cancellation or deadline                          |
| `LIVE_PROTOCOL`                        | Malformed provider data                                 |
| `LIVE_STATE`                           | Operation is unavailable in the current lifecycle state |
| `LIVE_BACKPRESSURE`                    | Buffer or pending-command limit                         |
| `LIVE_FINALIZATION`                    | Remote finalization was not confirmed                   |

## Role Cast integration and validation

Future integration must map training call IDs to Live IDs, supply authorized Persona context, store transcript fragments, define completed training turns, handle Judge intervention, and control playback. Streaming fragments cannot be passed directly to the existing validated `Agents.run()`/Engine contract. If speech must wait for Judge approval, the application must enforce that playback policy; direct model audio is not gated by this wrapper.

Tests use injected transports and loopback HTTP/WebSocket providers. Run `npm test` and `npm run check` from the repository root. Example interaction, cleanup, the real pinned SDK's wire format, redacted errors, races, deadlines, and package isolation are covered. No test reads real `.env` credentials or calls a paid endpoint. Live-account access, microphone interoperability, and actual voice quality remain unverified.

For controlled tests, the optional second constructor argument is `{ createSdk(config), openSocket(sdk, { sessionId, connectTimeoutMs }, handlers) }`. A transport returns `{ send(event), dispose(), get bufferedAmount() }` and invokes `handlers.open()`, `event(event)`, `error(error)`, or `close()` asynchronously after returning its handle. See [the test harness](../../tests/support/live.js).

Protocol references checked on 2026-09-12: [Live overview](https://developers.openai.com/api/docs/guides/live), [WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets?api=live), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [sideband controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live), [conversation lifecycle](https://developers.openai.com/api/docs/guides/live-conversations), and [delegation](https://developers.openai.com/api/docs/guides/live-delegation).
