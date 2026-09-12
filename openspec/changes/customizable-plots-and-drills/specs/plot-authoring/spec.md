## Purpose

Allow local users to author reusable plots with independently configured agent instructions, and run reproducible drills without changing previous conversations when a plot is edited.

## ADDED Requirements

### Requirement: Editable reusable plots
The system SHALL allow users to create, copy, edit and persist plots through a web editor, including descriptive fields, goals, fixed facts, criteria, stop conditions, limits and separate Mastermind, Judge and Reporter prompts. It SHALL reject invalid or oversized definitions and duplicate fact IDs/keys or criterion IDs without partial saves.

#### Scenario: Extend an existing plot
- **WHEN** the user copies a built-in plot, edits its name and prompts, and saves
- **THEN** a new plot is selectable for a drill, the original is unchanged, and the new plot survives restart

#### Scenario: Concurrent edits
- **WHEN** a user saves an outdated plot version
- **THEN** the update is rejected with a conflict and the editor retains the draft

### Requirement: Portable plot definitions
The system SHALL export and import versioned JSON plot definitions without drill history. Import SHALL validate the format and show a draft before saving; it SHALL create a new identity rather than overwrite an existing plot.

#### Scenario: Round trip
- **WHEN** an exported plot is imported and saved
- **THEN** all definition fields and prompts are preserved under a new plot identity

#### Scenario: Invalid import
- **WHEN** malformed JSON, an unsupported format version or invalid fields are imported
- **THEN** an actionable validation error is shown and no plot is saved

### Requirement: Independent agent instructions
The system SHALL apply each plot's Mastermind prompt only to planning, Judge prompt to Watch and Recap, and Reporter prompt only to final reporting. Persona SHALL retain its fixed dialogue contract. Custom instructions MUST NOT disable schema, evidence, identity or fact validation. Reporter SHALL receive evaluation evidence without Mastermind private instructions.

#### Scenario: Distinct prompts
- **WHEN** a drill runs with three distinct author instructions
- **THEN** each operation receives only its own role instruction plus its fixed system contract, and final reporting identifies as Reporter

### Requirement: Immutable drill configuration
Each drill SHALL snapshot the selected plot identity, version, definition and effective prompts when created. Edits SHALL affect only subsequently created drills. Public drill responses SHALL omit private prompts and fixed facts.

#### Scenario: Edit during a drill
- **WHEN** a plot is edited while its drill is active
- **THEN** remaining calls and reporting use the original snapshot and a later drill uses the edited version

### Requirement: Existing record compatibility
The system SHALL present sessions as drills and scenarios as plots while preserving existing IDs, transcripts, reports and saved operation prompts. Existing session/scenario API clients SHALL remain usable through compatibility routes.

#### Scenario: Upgrade existing database
- **WHEN** a database from the text MVP is opened
- **THEN** its historical records remain readable, unfinished records become interrupted as before, and edited plots are not overwritten on later restarts
