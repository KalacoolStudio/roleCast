## 1. Plot Definition and Authoring

- [x] 1.1 Remove `facts` and `criteria` from the current plot schemas and built-in definitions, set new-plot Mastermind/Judge guidance to the exact current anti-fraud prompts, add portable format version 2 plus version-1 normalization, and verify plot contract/import/export tests pass.
- [x] 1.2 Remove fixed-fact and evaluation-criterion controls and helpers from the plot editor while retaining `stopCondition`, and verify component/browser coverage can create, edit, copy, export, and import a fact-free and criterion-free plot.

## 2. Agent and Call Contracts

- [x] 2.1 Remove `allowedFactIds` and `criterionIds` from structured model schemas, reference rules, validation hints, and fixed prompt instructions; require valid evidence for `stop=true`, and verify provider/schema tests reject deprecated or unsupported output fields.
- [x] 2.2 Remove facts and criteria from Mastermind, Persona, Judge, Recap, and Reporter contexts and from persisted assignments while preserving task goals, shared-message isolation, evidence validation, and model-derived report dimensions; verify core text lifecycle and privacy tests pass.
- [x] 2.3 Remove facts and criteria from Live session/assistance contexts and continuous Judge checks, then verify voice tests cover evidence-grounded Judge stops, partial transcript handling, Persona hangup, and stale-result cancellation under the new shapes.

## 3. Persistence and Compatibility

- [x] 3.1 Add a transactional storage-version migration that removes deprecated plot/snapshot facts and criteria, assignment fact references, and Watch criterion IDs while preserving prompts, identities, transcripts, evidence, call outcomes, recaps, reports, and events; verify legacy migration, rollback, and reopen tests pass.
- [x] 3.2 Update plot, drill, and legacy scenario API projections for the new strict definition and confirm current create/update requests reject deprecated fields while supported version-1 file imports normalize them; verify server integration and workspace-isolation tests pass.

## 4. Documentation and End-to-End Verification

- [x] 4.1 Update README, guidelines, examples, and nearby developer documentation to describe fraud-focused defaults, fact-free Persona assignments, evidence-only Judge stops, legacy import normalization, and criterion-free reports; verify repository search finds no current documentation promising removed fields.
- [x] 4.2 Run the complete unit/integration/browser-relevant test suite, static checks, production build, and `openspec validate simplify-fraud-plot-contract --strict`; resolve regressions and verify no active runtime, UI, schema, or serialized current-format path still exposes the removed fields.
