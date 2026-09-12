# Role Cast specifications

The specifications under `specs/` describe the current combined application. Completed proposals, designs, tasks, and validation records live under `changes/archive/`. Create future changes under `changes/` and describe their differences from these published specs.

| Capability | Current contract |
| --- | --- |
| [simulation-lifecycle](specs/simulation-lifecycle/spec.md) | Plot selection, workspace-scoped drills, Persona identity and voice, planning, and call boundaries |
| [text-training-ui](specs/text-training-ui/spec.md) | Prototype styling, illustrated plot selection, prepared anti-fraud chat, voice-only controls, captions, history, and refresh safety |
| [evaluation-reporting](specs/evaluation-reporting/spec.md) | Independent Judge decisions, one Recap per call, and evidence-based Reporter output |
| [local-runtime](specs/local-runtime/spec.md) | Shared credentials, model output contracts, deployment disclosures, browser workspace isolation, persistence, migrations, and project commands |
| [plot-authoring](specs/plot-authoring/spec.md) | Plot editing, import/export, role guidance, and immutable drill configuration |
| [drill-stage-events](specs/drill-stage-events/spec.md) | Ordered events, snapshot revisions, SSE, recovery, and privacy |
| [drill-stage-presentation](specs/drill-stage-presentation/spec.md) | Illustrated office workspace, role movements, current state, accessibility, and responsive layout |
| [gpt-live-client](specs/gpt-live-client/spec.md) | Reusable server-side Live wrapper, media, delegation, and lifecycle |
| [voice-conversation](specs/voice-conversation/spec.md) | Voice-only calls, automatic speech, controls, ownership, manual retry, and usage limits |
| [voice-evidence](specs/voice-evidence/spec.md) | Transcript provenance, automatic checkpoints, continuous evaluation, and recovery |
| [atm-drawer](specs/atm-drawer/spec.md) | Simulated transfers/withdrawals, drill balances, and immutable ATM action evidence |

The 2026-09-12 consolidation reconciles the older text MVP contracts with customizable plots, Reporter separation, shared `API_KEY`, strict operation outputs, and voice integration. The later main integration adds voice-only participant controls, stable Persona voices, ATM evidence, and SQLite version 5 browser workspace ownership, retaining the older migration paths. Voice checkpoints advance public snapshots without inventing stage turns, and caption following uses the transcript panel's scroll position.

The archived text MVP describes its original three-role design and `LLM_API_KEY` configuration. Those historical artifacts are retained; the current specs above incorporate subsequent changes. Validation records distinguish fixture coverage from real-device and paid-provider checks.

Completed changes, in implementation order:

- [role-cast-text-mvp](changes/archive/2026-09-12-role-cast-text-mvp/)
- [add-justfile](changes/archive/2026-09-12-add-justfile/) — tooling only; no delta specs
- [customizable-plots-and-drills](changes/archive/2026-09-12-customizable-plots-and-drills/)
- [drill-live-stage](changes/archive/2026-09-12-drill-live-stage/)
- [add-gpt-live-wrapper](changes/archive/2026-09-12-add-gpt-live-wrapper/)
- [add-live-voice-conversation](changes/archive/2026-09-12-add-live-voice-conversation/), including [main integration validation](changes/archive/2026-09-12-add-live-voice-conversation/validation.md)

Active changes with published specs already synchronized:

- [align-website-prototype-style](changes/align-website-prototype-style/) — retrospective proposal, design, completed tasks, and validation for the orange/cream theme and bundled scene previews. Also corrects the existing office-stage background description. The local `PORT=3001` fix is recorded as configuration evidence; the application default remains 3000. Implementation is complete; the change remains active for review and later archive.
- [add-anti-fraud-chat-intro](changes/add-anti-fraud-chat-intro/) — prepared marketplace chat before the built-in anti-fraud call drill, with local photos, ordered playback, an enlarged order notice, independent-verification explanation, and explicit callback handoff. Scripted messages remain separate from real transcripts and evaluation. Planning artifacts preceded implementation; see its validation record for browser coverage.

Other active changes retained from main:

- [add-gcp-ci-deploy](changes/add-gcp-ci-deploy/) — deployment implementation and recorded cloud acceptance. Its local-runtime disclosure is synchronized; the three new cloud capability deltas remain under the active change as received from main. Workspace-related wording has been reconciled with current main; original live validation remains historical evidence.

Run `openspec validate --all --strict` to validate current specs and active changes, or `openspec list` to inspect pending work. See [main integration validation](changes/add-anti-fraud-chat-intro/validation.md) for this branch's combined merge checks.
