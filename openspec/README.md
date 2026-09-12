# Role Cast specifications

The specifications under `specs/` describe the current combined application. Completed proposals, designs, tasks, and validation records live under `changes/archive/`. Create future changes under `changes/` and describe their differences from these published specs.

| Capability | Current contract |
| --- | --- |
| [simulation-lifecycle](specs/simulation-lifecycle/spec.md) | Plot selection, drill snapshots, Persona identity, planning, and call boundaries |
| [text-training-ui](specs/text-training-ui/spec.md) | Text interaction, history, refresh, and duplicate submission safety |
| [evaluation-reporting](specs/evaluation-reporting/spec.md) | Independent Judge decisions, one Recap per call, and evidence-based Reporter output |
| [local-runtime](specs/local-runtime/spec.md) | Shared credentials, model output contracts, local persistence, migrations, and project commands |
| [plot-authoring](specs/plot-authoring/spec.md) | Plot editing, import/export, role guidance, and immutable drill configuration |
| [drill-stage-events](specs/drill-stage-events/spec.md) | Ordered events, snapshot revisions, SSE, recovery, and privacy |
| [drill-stage-presentation](specs/drill-stage-presentation/spec.md) | Role movements, current state, accessibility, and responsive layout |
| [gpt-live-client](specs/gpt-live-client/spec.md) | Reusable server-side Live wrapper, media, delegation, and lifecycle |
| [voice-conversation](specs/voice-conversation/spec.md) | Hands-free audio, controls, ownership, text fallback, and usage limits |
| [voice-evidence](specs/voice-evidence/spec.md) | Transcript provenance, automatic checkpoints, continuous evaluation, and recovery |

The 2026-09-12 consolidation reconciles the older text MVP contracts with customizable plots, Reporter separation, shared `API_KEY`, strict operation outputs, and voice integration. SQLite version 4 supports both the earlier voice version 2 layout and main's plot/stage versions 2 and 3. Voice checkpoints advance public snapshots without inventing stage turns, and caption following uses the transcript panel's scroll position.

The archived text MVP describes its original three-role design and `LLM_API_KEY` configuration. Those historical artifacts are retained; the current specs above incorporate subsequent changes. Validation records distinguish fixture coverage from real-device and paid-provider checks.

Completed changes, in implementation order:

- [role-cast-text-mvp](changes/archive/2026-09-12-role-cast-text-mvp/)
- [add-justfile](changes/archive/2026-09-12-add-justfile/) — tooling only; no delta specs
- [customizable-plots-and-drills](changes/archive/2026-09-12-customizable-plots-and-drills/)
- [drill-live-stage](changes/archive/2026-09-12-drill-live-stage/)
- [add-gpt-live-wrapper](changes/archive/2026-09-12-add-gpt-live-wrapper/)
- [add-live-voice-conversation](changes/archive/2026-09-12-add-live-voice-conversation/), including [main integration validation](changes/archive/2026-09-12-add-live-voice-conversation/validation.md)

Run `openspec validate --all --strict` to validate current specs and active changes, or `openspec list` to inspect pending work.
