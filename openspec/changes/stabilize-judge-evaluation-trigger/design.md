## Context

See `proposal.md` for motivation. GPT Live supplies timestamped transcript deltas but the current coordinator exposes no trusted completed-utterance event. The coordinator persists pending deltas every second, marks resulting evidence as partial, and currently invokes Judge from every periodic checkpoint. Judge already runs in-process with one active request and a pending high-water sequence.

## Goals / Non-Goals

**Goals:**

- Separate evidence persistence cadence from ordinary evaluation cadence.
- Prefer a short stable transcript window while bounding evaluation latency during continuous speech.
- Preserve direct in-process scheduling, coalescing, immediate formal-action handling, and final shutdown draining.
- Make timer ownership and cleanup deterministic.

**Non-Goals:**

- Invent a semantic sentence or turn-complete signal.
- Add SQLite polling, a new process, provider protocol assumptions, or browser-authored trusted evidence.
- Change the Watch result schema, expose private Watch content, or alter the participant UI.

## Decisions

### Use a receive-time stabilization window with a maximum-wait timer

The coordinator will treat each accepted user transcript delta as activity in an evaluation burst. It will restart a 750 ms stabilization timer and start a non-resetting 3,000 ms maximum-wait timer for the burst. Whichever timer fires first checkpoints pending evidence and requests Judge, then clears that burst's timers. These defaults will be constructor limits so deterministic tests can use shorter values.

Provider timestamps remain evidence metadata; server receive time owns scheduling because late and overlapping fragments are explicitly supported. The stabilization boundary is only a scheduling hint, and the existing partial-evidence warning remains in every Watch context.

Alternatives considered:

- Provider final event: the current integration does not expose a reliable event of that kind.
- Browser VAD boundary: it is client-controlled, can be affected by echo/noise, and is not a trustworthy semantic boundary.
- Fixed polling: unnecessary because transcript reception and Judge execution share a server process.

### Keep periodic persistence but remove its unconditional Judge trigger

The one-second checkpoint interval continues to make captions and evidence durable. Periodic persistence updates the pending user high-water mark but does not by itself start ordinary evaluation. Stabilization/max-wait callbacks checkpoint again safely and call the existing Judge loop; an empty checkpoint is harmless because Judge only runs when the high-water mark advances.

### Preserve one in-flight evaluation and accumulated follow-up

No new Judge queue is introduced. If a timer fires while Judge is running, the existing high-water state records newer evidence; the running Judge loop performs one accumulated follow-up after its current result. This bounds concurrency and avoids cancelling work repeatedly.

### Keep exceptional paths immediate and make cleanup explicit

Formal ATM messages continue to update the high-water mark and call Judge directly. Conversation-closure detection continues to bypass the model as soon as its evidence has been checkpointed by a stabilization or maximum-wait callback. Voice stop clears both evaluation timers before the final checkpoint, then uses the existing required-Judge drain so no timer can publish late work.

## Risks / Trade-offs

- [A 750 ms pause may occur inside a thought] → Treat the checkpoint as partial evidence and never use the pause itself as proof.
- [A critical phrase may wait up to the stabilization window] → Keep the window short and retain immediate formal-action and deterministic closure paths.
- [Continuous speech creates partial checks every maximum window] → Retain one in-flight request and accumulated coalescing to bound model concurrency.
- [Late fragments arrive after a check] → Start a new burst and include them in a subsequent accumulated evaluation without rewriting prior evidence.
- [Timer races during shutdown] → Clear and invalidate burst timers before sealing evidence and draining Judge.

## Migration Plan

No data migration is required. Deploy the coordinator and tests together. Rollback restores checkpoint-triggered evaluation without changing persisted records or public APIs.
