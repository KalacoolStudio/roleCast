## Context

See [proposal.md](proposal.md) for motivation. Today the same two concepts cross every layer: plot schemas require `facts` and non-empty `criteria`; Mastermind emits `allowedFactIds`; assignments copy selected facts; text and voice Persona contexts include them; Judge emits `criterionIds`; Reporter receives criteria; and SQLite JSON payloads preserve each shape. The editor and portable format expose the same fields. Model outputs are protected by strict schemas plus a second semantic-validation pass, so removing only the UI would leave the runtime coupled to empty IDs and make valid Judge stops impossible.

The database stores JSON payloads for plots, drill metadata, assignments, Watches, and reports rather than relational fact/criterion columns. This makes a transactional JSON migration feasible. Existing role prompts, transcript/evidence IDs, call outcomes, recaps, and reports must remain intact.

## Goals / Non-Goals

**Goals:**

- Produce one fact-free, criterion-free contract across authoring, persistence, text agents, Live voice, validation, and documentation.
- Preserve evidence-grounded automatic Judge stops by requiring at least one valid `evidenceId` whenever `stop` is true.
- Make the exact current anti-fraud Mastermind and Judge author guidance the editable defaults of a new plot draft.
- Accept supported legacy portable plots and databases without carrying deprecated fields into new runtime work.

**Non-Goals:**

- Preserve structured order numbers, amounts, company names, or selective disclosure previously supplied through facts.
- Preserve criterion-linked analytics or guarantee the previous interview rubric's quality after its criteria are removed.
- Change call duration, turn limits, Persona identity, shared-message isolation, transcript provenance, or the single-close lifecycle.
- Turn fraud-specific author guidance into an uneditable universal system instruction; custom plots still retain separate editable role prompts.

## Decisions

### 1. Remove fields from contracts instead of substituting empty collections

`facts`, `criteria`, `allowedFactIds`, assignment `facts`, and `criterionIds` will disappear from schemas and serialized current-format values. Mastermind assignments retain `goal` and `sharedMessageIds`; Persona contexts retain identity, task, explicit shared messages, own history, and opening state. Judge Watch retains `stop`, `reason`, and `evidenceIds`.

Keeping empty arrays was rejected because it would preserve authoring and model vocabulary that the user asked to remove, complicate prompts, and leave a misleading impression that these features remain available.

### 2. Preserve stopCondition and strengthen evidence-only stop validation

Judge receives `stopCondition`, the current call transcript, partial-voice uncertainty where applicable, and its effective author guidance. `stop=true` is valid only with at least one existing message ID; `stop=false` may use an empty evidence list. This keeps deterministic evidence validation while allowing the anti-fraud Judge guidance to define the semantic standard.

Allowing an evidence-free reason was rejected because it would weaken the existing guard against arbitrary LLM-triggered hangups. Keeping a hidden synthetic criterion was rejected because it would merely rename the removed concept.

### 3. Keep generic system boundaries and move fraud guidance into plot defaults

The generic Mastermind and Judge system contracts will be rewritten only to remove fact/criterion vocabulary and to retain identity, evidence, stop, and role-separation rules. `blankPlot()` will use the exact current anti-fraud Mastermind and Judge prompt strings as editable author guidance. The built-in anti-fraud plot keeps those same strings. Reporter retains its current default unless separately configured.

Hard-coding fraud semantics into the system contract was rejected because it would make existing custom plots impossible to repurpose and would mix behavioral safety rules with editable scenario policy.

### 4. Version portable definitions and normalize legacy input at the boundary

Exports will use `formatVersion: 2` with a strict fact-free and criterion-free plot schema. Import will accept version 1, explicitly remove `facts` and `criteria`, validate all remaining fields against the new definition, and return a version-2-shaped draft. Version 2 rejects unknown deprecated fields like any other unknown field.

Silently accepting deprecated fields in all current requests was rejected because it hides client mistakes. Legacy normalization is limited to the clearly versioned import and database migration paths; create/update APIs use the new strict schema.

### 5. Add a transactional database migration for all persisted occurrences

The storage schema version will advance. In one transaction the migration will:

- remove `facts` and `criteria` from plot payloads and embedded drill plot snapshots;
- remove `allowedFactIds` and `facts` from assignment payloads;
- remove `criterionIds` from Watch payloads;
- leave prompts, messages, evidence IDs, call records, recaps, reports, stage events, and identities unchanged.

The migration operates on raw JSON before normal runtime parsing so legacy strict schemas cannot block startup. As with existing recovery, non-terminal drills are subsequently marked interrupted and are not resumed.

Runtime-only normalization without a migration was rejected because deprecated data would keep resurfacing through direct storage reads and would make the meaning of “all removed” dependent on code path.

### 6. Reporter derives dimensions without a rubric collection

Reporter context becomes `{ goal, messages, recaps, voiceEvidence? }`; its existing output shape still requires one or more named dimensions and evidence-linked findings. The Reporter author prompt and goal define the useful dimensions. Validation continues to reject nonexistent evidence IDs and requires `insufficientEvidence=true` when no user evidence exists.

Removing report dimensions entirely was rejected because it is not required to remove plot criteria and would unnecessarily degrade the final report UI and history format.

## Risks / Trade-offs

- [Scenario details become less stable without fixed facts] → Keep the assignment goal and role prompt explicit, instruct Persona to express uncertainty for unknown details, and document that exact scripted facts are no longer enforced.
- [Judge behavior becomes more prompt-dependent] → Keep `stopCondition`, use the fraud guidance by default, require valid evidence for every stop, and retain bounded failure rather than accepting malformed output.
- [Existing custom and interview plots lose authored rubrics] → Preserve their prompts, goals, stop conditions, and recorded history during migration, but document that criterion-specific behavior is intentionally not preserved.
- [Legacy API clients send removed fields] → Reject deprecated fields on current create/update requests with the normal actionable validation error; provide versioned import normalization for portable files.
- [Migration alters JSON payloads] → Execute it in one SQLite transaction, bump the schema version only after all rewrites succeed, and test rollback/reopen behavior from representative legacy fixtures.

## Migration Plan

1. Ship the new code and database-version migration together; migration runs before plots or drills are parsed under the new strict schemas.
2. Normalize stored plots, embedded snapshots, assignments, and Watches while retaining evidence-bearing records and saved prompts.
3. Seed built-in plots under the new schema and expose version-2 portable exports.
4. Verify migrated historical drills, new fraud-default drafts, text/voice Judge stops, final reporting, and workspace isolation through automated tests.
5. Rollback requires restoring the pre-upgrade database backup and prior binary; the newer database version prevents an older binary from opening a partially incompatible store.
