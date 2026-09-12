## MODIFIED Requirements

### Requirement: Durable local records
The system SHALL locally persist plot definitions, drill snapshots, Personas, assignments, accepted messages, end reasons, Judge results, stage events, voice transcript evidence and final reports. Confirmed messages SHALL remain readable after restart. A non-terminal drill present at process restart SHALL become interrupted and remain readable without resending model work or claiming a resumed call. Legacy databases SHALL migrate transactionally to the fact-free and criterion-free runtime definition; migration failure SHALL leave the prior schema intact, and existing IDs, prompts, transcripts, call outcomes, evidence, reports and event order SHALL NOT be lost.

#### Scenario: Process restarts mid call
- **WHEN** the process stops during a call and restarts
- **THEN** the old drill displays as interrupted with its existing records, the user can start a new drill, and the old call is not automatically resumed

#### Scenario: Legacy definition migration
- **WHEN** the application opens a database containing fixed facts, evaluation criteria, Allowed Fact references or criterion-linked Watch records
- **THEN** active runtime definitions and model contracts omit the deprecated fields while historical evidence, stop outcomes, prompts, transcripts, recaps and reports remain readable

### Requirement: Bounded failures and validated model results
All model requests SHALL have timeouts and bounded retries. Invalid structure, unknown Persona IDs, unknown shared-message IDs, or invalid evidence references SHALL be rejected before state is updated. A planning, turn, recap or report operation that cannot complete SHALL fail the drill while preserving saved data; the system SHALL NOT substitute fabricated replies or reports. Cancelled call requests SHALL NOT be retried.

#### Scenario: Invalid model response
- **WHEN** model output is missing required fields or contains invalid identity, shared-message, or evidence references after bounded repair
- **THEN** the drill displays an understandable failure and the invalid result does not become an official Persona, message, recap or report

#### Scenario: Cancelled generation
- **WHEN** the participant or Judge ends a call before an earlier model operation completes
- **THEN** the later result is discarded without retrying or overwriting the completed termination state

### Requirement: Fixed operation output contracts
Agent outputs SHALL use the application's fixed structured envelope and operation schema. Author guidance SHALL remain subordinate to the system contract and MUST NOT add arbitrary output fields or weaken identity, shared-message, or evidence validation. Mastermind output SHALL NOT contain Allowed Fact IDs, and Judge Watch output SHALL NOT contain criterion IDs. Voice assistance SHALL permit an empty context string while retaining its size bound.

#### Scenario: Author requests another output shape
- **WHEN** a custom role prompt requests deprecated fact or criterion fields, other undefined fields, or invented evidence references
- **THEN** the result is rejected before updating persisted state, and bounded repair receives validation feedback without reflecting private provider output

#### Scenario: Explicit endpoint compatibility mode
- **WHEN** the configured text endpoint uses JSON-object or plain-text output mode
- **THEN** the same local schema and identity, shared-message, and evidence checks apply before the operation can succeed
