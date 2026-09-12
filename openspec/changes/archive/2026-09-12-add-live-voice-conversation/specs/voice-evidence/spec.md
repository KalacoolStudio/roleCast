## Purpose

Preserve spoken Role Cast conversations as traceable local evidence and let Judge observe ongoing speech, end calls, and produce grounded recaps and reports without inventing completed turns or claiming that all generated speech was heard.

## ADDED Requirements

### Requirement: Durable transcript provenance

The server SHALL preserve accepted source transcript fragments with their speaker, original text, provider timing, receive order, and application call/voice-attempt identity. Source text SHALL retain whitespace and repeated words. Duplicate provider event IDs within an attempt SHALL NOT duplicate evidence, while legitimately repeated speech SHALL remain distinct. Transcripts SHALL originate from the server-owned provider connection; browser captions or user-supplied role labels SHALL NOT create trusted Persona evidence. Raw audio SHALL NOT be persisted by this feature.

#### Scenario: Overlapping speakers
- **WHEN** user and Persona transcript intervals overlap
- **THEN** both speakers' source fragments and timing are retained without rewriting them into a falsely alternating conversation

#### Scenario: Duplicate provider event
- **WHEN** the same event ID is received twice within one voice attempt
- **THEN** it is accepted once, while identical words received under distinct event IDs remain separate source text

#### Scenario: Forged browser transcript
- **WHEN** a browser sends a fabricated Persona transcript or Judge result
- **THEN** it is rejected and cannot become stored evidence or affect the call's outcome

### Requirement: Automatic evidence checkpoints

Accepted transcript text SHALL be checkpointed automatically into immutable, identifiable evidence records without requiring a submit action. Each checkpoint SHALL identify its source fragments and speaker. A checkpoint SHALL describe accumulated text, not assert that the speaker completed a semantic turn. Already accepted source text SHALL be checkpointed on voice shutdown, with incomplete status where appropriate. Late source text received while the attempt is active SHALL remain traceable without rewriting evidence already used by a completed evaluation.

#### Scenario: Speech continues through a checkpoint
- **WHEN** the user speaks continuously while automatic checkpoints occur
- **THEN** evidence is saved incrementally without restarting Persona generation, counting each checkpoint as a user turn, or assuming the user has finished

#### Scenario: Stage observes voice evidence
- **WHEN** a voice checkpoint updates a drill's public transcript
- **THEN** the public snapshot revision advances and subscribers can see the evidence, without emitting a turn-started or turn-completed event for that partial speech

#### Scenario: Delayed transcript fragment
- **WHEN** a fragment arrives with timing earlier than an already checkpointed interval during the same active attempt
- **THEN** its text remains visible and traceable as later-arriving evidence, and existing evidence IDs and evaluated text stay stable

#### Scenario: Stop with pending captions
- **WHEN** voice stops while accepted text has not yet reached a checkpoint
- **THEN** the accepted text is sealed into evidence for that call, and incomplete transcription or playback is identified without inventing missing words

### Requirement: Captions and evidence have distinct identities

Live captions SHALL update without waiting for Judge and SHALL support overlapping speakers and late fragments. Caption grouping SHALL be presentation logic, separate from immutable evidence checkpoints. Historical views and report links SHALL resolve evidence IDs to the exact stored text. Scrolling SHALL follow live captions only while the participant is at the bottom or explicitly returns to the latest text.

#### Scenario: Caption row grows
- **WHEN** more transcript fragments belong in an existing display group
- **THEN** the caption updates without creating a duplicate message, moving unrelated earlier content, or changing the identity of existing evidence

#### Scenario: Read earlier speech
- **WHEN** the participant scrolls up during ongoing voice
- **THEN** new captions preserve the position inside the drill's transcript panel, and an explicit return-to-latest control resumes following within that panel

### Requirement: Continuous independent Judge observation

Judge SHALL evaluate new accumulated user evidence during an active voice call without generating Persona speech or waiting for Live delegation. Checks SHALL use bounded concurrency, valid evidence IDs, the current call's criteria, and explicit knowledge that checkpoints can be partial. New input during a running check SHALL be covered by a subsequent accumulated check. No caption boundary, pause, confidence value, or acknowledgment alone SHALL count as evidence that a criterion was met. Judge work and audio delivery SHALL have independent lifecycles.

#### Scenario: Input arrives while Judge is busy
- **WHEN** more user speech is checkpointed during an ongoing Judge request
- **THEN** the new evidence is retained for the next accumulated check, earlier checks are not starved by endless cancellation, and audio continues

#### Scenario: Partial or ambiguous response
- **WHEN** the available transcript is incomplete or contains only an ambiguous acknowledgment
- **THEN** Judge does not claim a completed answer or achieved criterion without supporting recorded evidence

#### Scenario: Evaluation failure
- **WHEN** a required Judge check exhausts its bounded failure policy
- **THEN** the call stops and the exercise reports an evaluation failure with existing evidence preserved, rather than continuing an unevaluated exercise silently

### Requirement: Scoped Persona context and assistance

The voice Persona SHALL use its assigned identity, task, Allowed Facts, explicitly shared messages, and own prior-call context. It SHALL NOT receive other Personas' private history or Judge's private observations. A dedicated conversation prompt SHALL request natural Traditional Chinese speech rather than JSON. Client delegation SHALL be handled only by the server using authorized context and bounded validated backend work. Assistance SHALL NOT trigger Mastermind planning during a call or execute arbitrary external actions. A validated current Persona request to end the call SHALL use the existing single-close lifecycle.

#### Scenario: Recall a Persona in voice
- **WHEN** a previously used Persona takes a later voice call
- **THEN** it retains its identity and authorized memory while other Personas' private conversations remain excluded

#### Scenario: Delegation is metadata only
- **WHEN** Live emits a client-delegation notification
- **THEN** the server builds its backend request from authorized transcript/task state, never treats the delegation ID as task text, and discards obsolete results after the attempt ends

#### Scenario: Persona requests closure
- **WHEN** a validated backend result for the current Persona requests hangup
- **THEN** the current call ends once with the Persona reason, without replaying backend JSON or creating an extra text reply

#### Scenario: Assistance has no additional context
- **WHEN** backend assistance returns an empty context string with a valid hangup decision
- **THEN** the result is accepted under the fixed structured-output contract, while oversized context or undefined fields remain invalid and author instructions for other roles remain excluded

### Requirement: Single call termination across modes

Manual hangup, Judge stop, Persona hangup, voice duration limit, and finish-exercise SHALL converge on one call termination result and at most one successful Recap. Terminal transition SHALL stop new evidence publication and reject stale voice/control results. Recap SHALL use a fixed snapshot of accepted evidence before Mastermind proceeds. A mode switch alone SHALL NOT finish the call or create a Recap.

#### Scenario: Competing stop requests
- **WHEN** Judge and the participant request termination concurrently
- **THEN** one end reason is retained, output stops, and only one Recap/next-call decision is produced

#### Scenario: Late output after termination
- **WHEN** an ended voice attempt produces delayed audio, text, or backend results
- **THEN** they cannot alter the fixed call evidence, restart playback, change the report, or affect another call

### Requirement: Evidence-aware reporting and recovery

Recap and final reports SHALL ground claims in stored evidence and account for recognition uncertainty, overlap, partial checkpoints, and uncertain audio delivery. Generated output transcripts SHALL NOT prove the participant heard the whole utterance. Existing text histories SHALL remain readable after migration. Restart SHALL preserve committed voice evidence and mark active attempts/exercises interrupted without reconnecting; missing pending text SHALL NOT be fabricated.

#### Scenario: Interrupted Persona output
- **WHEN** a call stops while output was queued or playing
- **THEN** history identifies incomplete or unconfirmed delivery, and evaluation does not assume the participant heard an entire generated question

#### Scenario: Report cites voice evidence
- **WHEN** a report includes a voice-evidence ID
- **THEN** the participant can follow it to the exact saved checkpoint text and its call, with applicable uncertainty visible

#### Scenario: Restart during voice
- **WHEN** the server restarts during a voice conversation
- **THEN** committed source fragments and evidence remain readable, the old attempt is marked interrupted, and no paid session or microphone is automatically resumed

#### Scenario: Upgrade either branch's database
- **WHEN** a database using the earlier voice schema version 2 or plot/stage schema version 2 or 3 is opened
- **THEN** it upgrades transactionally to version 4 with plots, stage events, and voice evidence; existing identities, transcripts, reports, prompts, saved plots, and event sequences remain intact, and missing historical events are not fabricated

#### Scenario: Migration or recovery is repeated
- **WHEN** migration fails or a migrated database is reopened
- **THEN** a failed migration preserves the original schema and records, while successful restarts do not duplicate evidence or lifecycle events and recover pending voice text without model requests
