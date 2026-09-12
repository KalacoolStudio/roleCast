## MODIFIED Requirements

### Requirement: Scenario based sessions
The system SHALL provide the anti-fraud and interview built-in plots and allow custom plots. Existing scenario/session terminology SHALL be presented as plot/drill while retaining compatible routes. Each plot SHALL define an exercise goal, Judge stop condition, call limits, and separate role guidance without fixed-fact or evaluation-criterion collections. Users SHALL be able to select a plot and optionally provide participant background. Each private workspace SHALL permit only one non-terminal drill at a time while different workspaces remain independent.

#### Scenario: Start an exercise
- **WHEN** a user selects a valid plot and starts an exercise with no other active drill in the workspace
- **THEN** the system creates an isolated drill snapshot and asks Mastermind to plan the first call without fact or criterion IDs

#### Scenario: Concurrent start
- **WHEN** another drill is started while the same workspace already has a non-terminal drill
- **THEN** the second start is rejected with the existing drill identity while other workspaces remain unaffected

### Requirement: Planning only between calls
Mastermind SHALL decide only before the first call and after a completed call recap. Its output SHALL create a Persona, reuse an existing Persona, or finish the drill; an assignment SHALL contain its task goal and explicitly shared user-message IDs without Allowed Facts. Each drill SHALL use the effective Mastermind, Judge and Reporter guidance saved in its plot snapshot.

#### Scenario: Continue from recap
- **WHEN** a call ends and its Judge Recap completes
- **THEN** Mastermind uses the scenario, roster, accumulated transcript and recap to assign the next role task or finish and invoke Reporter

#### Scenario: Active call isolation
- **WHEN** the participant is in an active call with a Persona
- **THEN** the system does not invoke Mastermind to rewrite the task, identity or live conversation

### Requirement: Persistent persona identity and scoped facts
Persona SHALL persist within a drill roster, and every call SHALL have one fixed Persona ID and voice. Reuse SHALL retain that Persona's identity, voice and own prior-call memory. A new drill SHALL start with an empty roster. Persona context SHALL contain its identity, current task, explicitly shared user messages and its own prior-call history, and SHALL NOT contain another Persona's private history, fixed facts, evaluation criteria, Judge observations, or unshared user messages.

#### Scenario: Recall the same persona
- **WHEN** Mastermind selects a Persona used in an earlier completed call
- **THEN** the new call keeps the same ID, identity and voice, includes that Persona's history and new task, and leaves the earlier transcript unchanged

#### Scenario: New drill roster
- **WHEN** a previous drill has ended and the user starts another drill
- **THEN** Mastermind receives an empty Persona roster and no identity, voice mapping, or conversation memory from the previous drill

#### Scenario: Contradictory assignment
- **WHEN** Mastermind returns deprecated Allowed Fact or inline fact fields in an assignment
- **THEN** the strict output contract rejects the assignment before a call can start

#### Scenario: Unknown background detail
- **WHEN** the participant asks for a detail not present in the Persona's task or authorized memory
- **THEN** the Persona is instructed to express uncertainty instead of presenting the detail as known background
