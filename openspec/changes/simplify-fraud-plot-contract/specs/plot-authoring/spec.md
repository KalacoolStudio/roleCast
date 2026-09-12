## MODIFIED Requirements

### Requirement: Editable reusable plots
The system SHALL allow users to create, copy, edit and persist plots through a web editor, including descriptive fields, goals, stop conditions, typed-turn, call-count and cumulative voice-duration limits, and separate Mastermind, Judge and Reporter prompts. Plot definitions and the editor SHALL NOT expose fixed-fact or evaluation-criterion collections. New plot drafts SHALL use the built-in anti-fraud Mastermind and Judge guidance as their default role prompts. The system SHALL reject invalid or oversized definitions without partial saves.

#### Scenario: Extend an existing plot
- **WHEN** the user copies a built-in plot, edits its name and prompts, and saves
- **THEN** a new plot is selectable for a drill, the original is unchanged, the new plot survives restart, and neither definition contains fixed-fact or criterion fields

#### Scenario: New fraud-focused draft
- **WHEN** the user opens a blank new-plot draft
- **THEN** its Mastermind and Judge prompts contain the current built-in anti-fraud guidance and remain editable before save

#### Scenario: Concurrent edits
- **WHEN** a user saves an outdated plot version
- **THEN** the update is rejected with a conflict and the editor retains the draft

### Requirement: Portable plot definitions
The system SHALL export and import versioned JSON plot definitions without drill history. Exported definitions SHALL NOT contain fixed facts or evaluation criteria. Import SHALL validate the format, normalize supported legacy definitions by discarding their deprecated `facts` and `criteria` fields, show the resulting draft before saving, and create a new identity rather than overwrite an existing plot.

#### Scenario: Round trip
- **WHEN** a current-format exported plot is imported and saved
- **THEN** all supported definition fields and prompts are preserved under a new plot identity without fixed-fact or criterion fields

#### Scenario: Legacy import
- **WHEN** a supported legacy plot containing `facts` or `criteria` is imported
- **THEN** the import preview omits those deprecated fields while preserving the remaining supported settings and prompts

#### Scenario: Invalid import
- **WHEN** malformed JSON, an unsupported format version or invalid supported fields are imported
- **THEN** an actionable validation error is shown and no plot is saved

### Requirement: Independent agent instructions
The system SHALL apply each plot's Mastermind prompt only to planning, Judge prompt to Watch and Recap, and Reporter prompt only to final reporting. Persona SHALL retain its fixed dialogue and voice-assistance contracts. Custom instructions MUST NOT disable schema, evidence, identity or shared-message validation. Reporter SHALL receive recorded evaluation evidence without Mastermind private instructions.

#### Scenario: Distinct prompts
- **WHEN** a drill runs with three distinct author instructions
- **THEN** each operation receives only its own role instruction plus its fixed system contract, and final reporting identifies as Reporter

### Requirement: Immutable drill configuration
Each drill SHALL snapshot the selected plot identity, version, supported definition fields and effective prompts when created. Edits SHALL affect only subsequently created drills. Public drill responses SHALL omit private prompts.

#### Scenario: Edit during a drill
- **WHEN** a plot is edited while its drill is active
- **THEN** remaining calls and reporting use the original snapshot and a later drill uses the edited version

### Requirement: Existing record compatibility
The system SHALL present sessions as drills and scenarios as plots while preserving existing IDs, transcripts, reports and saved operation prompts. Existing session/scenario API clients SHALL remain usable through compatibility routes, but deprecated fixed-fact and criterion definition fields SHALL NOT be returned or used by new model work.

#### Scenario: Upgrade existing database
- **WHEN** a database containing legacy plots, assignments, or drill snapshots is opened
- **THEN** supported settings, identities, transcripts, reports, prompts and evidence remain readable while fixed facts, criteria and their active assignment references are removed from the normalized runtime records
