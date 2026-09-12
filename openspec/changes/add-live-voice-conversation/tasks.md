## 1. Configuration and module wiring

- [x] 1.1 Add optional Live configuration through the existing server environment loader and public capability reporting; verify text-only startup, invalid optional settings, explicit `gpt-live-1`/client-delegation/recording defaults, environment precedence, and secret-free responses using temporary configuration fixtures.
- [x] 1.2 Declare the relay's `ws` dependency and wire injectable voice coordinator/media interfaces into server startup and shutdown; verify workspace imports and that constructing a text-only app causes no Live connection or new configuration requirement.

## 2. Durable source data and evidence

- [x] 2.1 Add a transactional SQLite version-1-to-2 migration for voice attempts/fragments and compatible store methods; verify old text histories, foreign keys, duplicate event handling, distinct repeated speech, and absence of persisted audio, credentials, or raw private provider events.
- [x] 2.2 Implement exact fragment ingestion and automatic immutable evidence checkpoints with source links, timing, receive order, partial/delivery markers, and shutdown sealing; verify overlap, whitespace, missing event IDs, late fragments, oversized text splitting, and stable evidence IDs without duplicate content.
- [x] 2.3 Extend public history/report projections and restart recovery for voice evidence; verify reports resolve exact checkpoint text, uncheckpointed durable fragments recover without model calls, old voice attempts become interrupted, and private metadata stays outside participant responses.

## 3. Core voice orchestration

- [x] 3.1 Add compatible call-mode acceptance/reservation transitions and dedicated scoped Live conversation context; verify voice acceptance skips text generation, existing-call activation waits for idle text work, concurrent typed sends are rejected, and Persona identity/Allowed Facts/own-history boundaries remain intact.
- [x] 3.2 Implement the independently scoped voice Judge scheduler with one in-flight check and coalesced pending evidence; verify additional input is eventually covered, checks are not starved by new fragments, partial checkpoints are described correctly, evidence is validated, and speech delivery does not await Judge.
- [x] 3.3 Add the bounded `voiceAssist` contract/prompt and client-delegation handler; verify authorized context, deduplication and pending limits, safe quiet-context return, validated Persona hangup, no duplicate user-facing reply, no Mastermind work during calls, and rejection of stale results.
- [x] 3.4 Unify voice sealing/media shutdown with all existing call-stop and finish paths; verify competing Judge/manual/Persona stops produce one end reason and Recap, mode switches preserve the call, and late provider/agent results cannot change the fixed evidence snapshot or the next call.
- [x] 3.5 Add the cumulative `maxVoiceSecondsPerCall` budget and voice-aware Recap/report context; verify muted time and repeated attempts consume the same default 180-second budget, only typed submissions consume typed-turn limits, total-call limits remain effective, and uncertain playback/recognition is reflected in evaluation inputs.

## 4. Server audio relay

- [x] 4.1 Implement call-bound voice reservations, expiring single-use attachment tokens, exact-origin WebSocket validation, and ownership conflicts; verify duplicate/expired/wrong-call requests and two-tab races cannot create multiple provider sessions or bypass the local application boundary.
- [x] 4.2 Connect the existing primary Live wrapper after browser attachment, build early public event projection, and request a voice-first greeting exactly once after readiness; verify no early event loss, no private fields/provider events reach the browser, continuation does not replay an opening, and startup cancellation releases the reservation and transport.
- [x] 4.3 Implement validated bidirectional PCM frames, narrow mute/control messages, queue limits, and Vite WebSocket proxy support; verify actual loopback WebSocket upgrade/packet behavior, sample ordering, malformed/binary/control input rejection, and explicit backpressure without hidden retries.
- [x] 4.4 Add heartbeat expiry, provider/browser failure handling, bounded close/finalization, and shutdown-before-database-close ordering; verify owner loss, unavailable providers, final usage versus incomplete finalization, healthy return to text, and no leftover timers, pending jobs, or connections.

## 5. Browser voice experience

- [x] 5.1 Implement testable streaming PCM conversion and microphone AudioWorklet capture; verify 24/44.1/48 kHz input rates, sample continuity across packets, correct PCM16LE encoding, bounded buffers, silence during mute, and no microphone-to-speaker monitoring.
- [x] 5.2 Implement output AudioWorklet playback and the injectable media controller; verify ordered playback/resampling, bounded queues, simultaneous input during output, suspended-audio handling, immediate queue clearing, and release of tracks/context/ports/sockets on every stop or partial startup failure.
- [x] 5.3 Add voice activation beside「寫下你的回覆…」and voice call acceptance, status, mute, and「改用文字」controls; verify microphone permission precedes provider creation, speech needs no submit click, text input follows the selected mode, and hangup/finish remain usable during voice work.
- [x] 5.4 Render live captions and saved voice evidence without duplicate speech, with stable grouping, partial/delivery indicators, report anchors, and user-controlled scrolling; verify overlap, late fragments, text/voice mixed history, growing rows, and preserved reading position.
- [x] 5.5 Wire call/mode/navigation/reload cleanup and Traditional Chinese error/fallback states; verify denied permission, unsupported browser, failed startup, provider loss, old-attempt events, and refresh never reacquire the microphone or reconnect a paid session automatically.

## 6. Integrated verification and documentation

- [x] 6.1 Extend the offline browser server and Playwright coverage with controlled media and Live events; verify voice-first and composer activation, automatic captions/audio, mute, return to text, Judge stop during playback, Persona closure, duration limit, report evidence, and unchanged desktop/mobile text flows without real keys or paid endpoints.
- [x] 6.2 Update `.env.example`, README, voice UI help, and the module integration guide; verify documented configuration and controls match the implementation, continuous Judge timing and the voice duration budget are explicit, and the real-device checklist covers microphone/echo/interruption/Traditional Chinese/latency separately from fixture tests.
- [x] 6.3 Run `npm run build`, `npm test`, `npm run check`, and `openspec validate add-live-voice-conversation --strict`; record results and migration/recovery coverage in validation notes, clearly distinguishing offline successes from any unverified live-account and audio-quality checks.

## 7. Shared credential refactor

- [x] 7.1 Use the existing `API_KEY` for both text agents and Live; retain `LLM_API_KEY` as a legacy text-only fallback, ignore `OPENAI_API_KEY`, and verify credential precedence and safe capability reporting with temporary fixtures.
- [x] 7.2 Update setup guidance, examples, and the voice OpenSpec configuration contract to describe one shared key and optional voice settings.
- [x] 7.3 Run the affected configuration/runtime tests, lint/format checks, and strict OpenSpec validation; restart the owned development server and verify health/voice configuration without a paid request.


## 8. Integration with main

- [x] 8.1 Reconcile plot/stage and voice database histories into atomic schema version 4; verify both branch layouts, retained plots/events/evidence, migration rollback, and repeatable interruption recovery.
- [x] 8.2 Integrate voice into the plot/drill UI and canonical routes while retaining legacy APIs and same-host HTTPS tunnels; preserve editable voice budgets, Reporter isolation, and the strict voice-assistance contract.
- [x] 8.3 Publish voice checkpoints through stage snapshots without invented turn events, and preserve caption reading position in the transcript panel.
- [x] 8.4 Validate the rebuilt frontend with all browser flows, run the combined unit/integration and format checks, and document migration behavior and current OpenSpec contracts.
