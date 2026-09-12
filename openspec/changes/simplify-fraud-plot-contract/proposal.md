## Why

Role Cast currently asks plot authors to duplicate fraud scenario knowledge across goals, fixed facts, evaluation criteria, stop conditions, and role prompts, while the runtime also exposes fact and criterion IDs in model contracts. The product is being narrowed around the fraud drill, so the fraud-specific Mastermind and Judge guidance can become the default behavioral contract and the separate fixed-fact and criterion authoring concepts can be removed.

## What Changes

- Make the current anti-fraud Mastermind and Judge guidance the defaults used for new plot definitions, while retaining separate editable role prompts and the existing evidence-based stop behavior.
- **BREAKING** Remove `facts` and `criteria` from plot definitions, authoring UI, import/export payloads, persisted active plot snapshots, and agent contexts.
- **BREAKING** Remove `allowedFactIds` and assignment `facts` from Mastermind output and Persona context; Persona behavior is instead grounded by its assigned goal, identity, explicitly shared user messages, and own prior-call history.
- **BREAKING** Remove `criterionIds` from Judge Watch output and validation. A stop decision continues to require valid recorded `evidenceIds` and a reason, and Judge uses the fraud-default guidance plus the plot's `stopCondition`.
- Remove criterion-dependent reporting input and let Reporter derive report dimensions from the plot goal, Judge recaps, recorded evidence, and Reporter guidance.
- Migrate or normalize existing stored and imported definitions so removed fields do not remain part of the active runtime contract, while preserving historical transcripts, call outcomes, recaps, reports, prompts, and evidence IDs.
- Update the built-in catalog, documentation, and automated tests for the fraud-focused contract; interview-specific behavior is not a compatibility target for this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plot-authoring`: Remove fixed-fact and criterion authoring/storage contracts and define the fraud-focused defaults and legacy-definition handling.
- `simulation-lifecycle`: Remove Allowed Facts and fixed-fact consistency from planning and Persona context while preserving identity, scoped history, and call lifecycle behavior.
- `evaluation-reporting`: Replace criterion-linked Watch and reporting with fraud-guided, evidence-linked stop decisions and model-derived report dimensions.
- `voice-evidence`: Remove current-call criteria and Allowed Facts from voice Judge/Persona context while retaining evidence validation and lifecycle isolation.
- `voice-conversation`: Remove Allowed Facts from the server-owned Live context contract.
- `text-training-ui`: Remove the obsolete Allowed Facts privacy reference while preserving participant-facing agent isolation.
- `drill-stage-events`: Remove Allowed Facts and hidden-fact terminology from the public event boundary while preserving assignment and model privacy.
- `local-runtime`: Remove fact/criterion validation from fixed operation contracts and define compatible migration of records containing removed fields.

## Impact

Affected areas include plot schemas and portable JSON, built-in/default plot definitions, the plot editor, Mastermind/Judge/Reporter structured-output schemas, role context construction, text and voice Persona context, engine assignments, storage migration/normalization, API compatibility projections, README/guidelines/OpenSpec text, and unit/browser tests. Existing external plot payloads containing removed fields become legacy input that must be explicitly normalized or rejected according to the new spec; current clients expecting those fields or model output IDs require migration.
