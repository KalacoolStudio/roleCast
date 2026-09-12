## MODIFIED Requirements

### Requirement: Continuous independent Judge observation

Judge SHALL evaluate new accumulated user evidence during an active voice call without generating Persona speech or waiting for Live delegation. Ordinary transcript checks SHALL prefer evidence that has remained unchanged for a bounded stabilization window, while a bounded maximum wait SHALL trigger a check during continuous speech. Stabilization and maximum-wait boundaries SHALL schedule evaluation only; they SHALL NOT assert that the participant completed a semantic turn. Checks SHALL use bounded concurrency, valid evidence IDs, the current call's criteria, and explicit knowledge that checkpoints can be partial. New input during a running check SHALL be covered by a subsequent accumulated check. Formal ATM evidence and validated explicit conversation closure SHALL remain eligible for immediate handling without waiting for ordinary stabilization. No caption boundary, pause, confidence value, or acknowledgment alone SHALL count as evidence that a criterion was met. Judge work and audio delivery SHALL have independent lifecycles.

#### Scenario: Stable transcript evidence
- **WHEN** new user transcript evidence remains unchanged for the stabilization window
- **THEN** Judge evaluates the latest accumulated evidence without waiting for the next periodic persistence checkpoint or blocking Persona audio

#### Scenario: Continuous speech reaches maximum wait
- **WHEN** user transcript fragments continue arriving without a stabilization window
- **THEN** Judge evaluates the accumulated evidence within the maximum wait while treating it as potentially partial

#### Scenario: Input arrives while Judge is busy
- **WHEN** more user speech is checkpointed during an ongoing Judge request
- **THEN** the new evidence is retained for the next accumulated check, earlier checks are not starved by endless cancellation, and audio continues

#### Scenario: Partial or ambiguous response
- **WHEN** the available transcript is incomplete or contains only an ambiguous acknowledgment
- **THEN** Judge does not claim a completed answer or achieved criterion without supporting recorded evidence

#### Scenario: Immediate formal action
- **WHEN** an active voice call records a completed formal ATM action
- **THEN** Judge receives and evaluates that evidence immediately without waiting for transcript stabilization

#### Scenario: Evaluation failure
- **WHEN** a required Judge check exhausts its bounded failure policy
- **THEN** the call stops and the exercise reports an evaluation failure with existing evidence preserved, rather than continuing an unevaluated exercise silently
