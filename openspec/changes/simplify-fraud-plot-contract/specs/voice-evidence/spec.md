## MODIFIED Requirements

### Requirement: Continuous independent Judge observation
Judge SHALL evaluate new accumulated user evidence during an active voice call without generating Persona speech or waiting for Live delegation. Checks SHALL use bounded concurrency, valid evidence IDs, the plot's stop condition, the effective fraud-focused Judge guidance, and explicit knowledge that checkpoints can be partial. Watch output SHALL NOT contain criterion IDs. New input during a running check SHALL be covered by a subsequent accumulated check. No caption boundary, pause, confidence value, acknowledgment, or unsupported inference alone SHALL count as sufficient evidence to stop. Judge work and audio delivery SHALL have independent lifecycles.

#### Scenario: Input arrives while Judge is busy
- **WHEN** more user speech is checkpointed during an ongoing Judge request
- **THEN** the new evidence is retained for the next accumulated check, earlier checks are not starved by endless cancellation, and audio continues

#### Scenario: Partial or ambiguous response
- **WHEN** the available transcript is incomplete or contains only an ambiguous acknowledgment
- **THEN** Judge does not claim a completed answer or stop the call without supporting recorded evidence

#### Scenario: Evaluation failure
- **WHEN** a required Judge check exhausts its bounded failure policy
- **THEN** the call stops and the exercise reports an evaluation failure with existing evidence preserved, rather than continuing an unevaluated exercise silently

### Requirement: Scoped Persona context and assistance
The voice Persona SHALL use its assigned identity, task, explicitly shared user messages, and own prior-call context. It SHALL NOT receive fixed facts, evaluation criteria, another Persona's private history, or Judge's private observations. A dedicated conversation prompt SHALL request natural Traditional Chinese speech rather than JSON. Client delegation SHALL be handled only by the server using authorized context and bounded validated backend work. Assistance SHALL NOT trigger Mastermind planning during a call or execute arbitrary external actions. A validated current Persona request to end the call SHALL use the existing single-close lifecycle.

#### Scenario: Recall a Persona in voice
- **WHEN** a previously used Persona takes a later voice call
- **THEN** it retains its identity and authorized memory while other Personas' private conversations remain excluded

#### Scenario: Delegation is metadata only
- **WHEN** Live emits a client-delegation notification
- **THEN** the server builds its backend request from authorized transcript, identity and task state, never treats the delegation ID as task text, and discards obsolete results after the attempt ends

#### Scenario: Persona requests closure
- **WHEN** a validated backend result for the current Persona requests hangup
- **THEN** the current call ends once with the Persona reason, without replaying backend JSON or creating an extra text reply

#### Scenario: Assistance has no additional context
- **WHEN** backend assistance returns an empty context string with a valid hangup decision
- **THEN** the result is accepted under the fixed structured-output contract, while oversized context or undefined fields remain invalid and author instructions for other roles remain excluded
