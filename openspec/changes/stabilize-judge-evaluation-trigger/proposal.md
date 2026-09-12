## Why

Voice Judge checks currently start on every one-second evidence checkpoint, even though GPT Live exposes transcript deltas rather than a reliable completed-utterance boundary. This can spend evaluation work on unstable half-sentences and permits a terminal decision before nearby transcript fragments clarify the participant's meaning.

## What Changes

- Keep one-second immutable evidence checkpoints and immediate public captions unchanged.
- Trigger ordinary voice Judge work after user transcript evidence has remained stable for a bounded quiet window, with a maximum-wait fallback during continuous speech.
- Preserve one in-flight Judge check with accumulated follow-up evidence, without adding a polling process or treating silence as proof of a completed semantic answer.
- Keep formal ATM actions and explicit conversation closure on their immediate evaluation paths.
- Drain the final required Judge check during voice shutdown and retain the existing failure and stale-result behavior.
- Add deterministic timing, coalescing, closure, ATM, and cleanup coverage.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-evidence`: Refine continuous Judge observation so evaluation timing prefers stable transcript evidence while retaining a bounded maximum latency and independent audio delivery.

## Impact

- Affects `apps/server/src/voice.js` scheduling and its voice coordinator tests.
- Does not change the GPT Live wire protocol, persisted evidence schema, public API, participant UI, or model output contract.
- Adds no dependency and does not reintroduce the old project's SQLite polling loop.
