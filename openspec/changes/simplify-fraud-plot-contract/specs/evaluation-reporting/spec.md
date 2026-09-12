## MODIFIED Requirements

### Requirement: Independent evidence based watch
In text mode Judge SHALL Watch every accepted complete user message using both sides of the completed conversation, the plot's stop condition, and the effective fraud-focused Judge guidance. Watch output SHALL contain whether to stop, a reason, and valid message evidence IDs, and SHALL NOT contain criterion IDs. Judge SHALL NOT design the next Persona or dialogue and SHALL NOT treat a model confidence claim, short acknowledgment, or unsupported inference as sufficient evidence.

#### Scenario: Clear criterion met
- **WHEN** a user message explicitly identifies the likely fraud and proposes independent verification through an official channel
- **THEN** Judge returns a stop decision with the supporting recorded message ID

#### Scenario: Ambiguous response
- **WHEN** the user only says “好” or gives another ambiguous acknowledgment
- **THEN** Judge does not treat the response as sufficient evidence to stop

#### Scenario: Unsupported stop
- **WHEN** Judge requests a stop without at least one valid evidence ID
- **THEN** the result is rejected before it can end the call

### Requirement: Final report grounded in recorded evidence
Reporter SHALL produce a report from the plot goal, transcript, Judge recaps, and effective Reporter guidance when a drill ends normally or at the user's request. Reporter SHALL derive appropriate report dimensions without a plot criterion collection. The report SHALL contain a summary, dimensions, evidence references, strengths, improvements and evidence insufficiencies. Every reference SHALL identify a real message in the drill, and abilities not demonstrated in recorded evidence SHALL NOT be reported as established. Reporter SHALL NOT receive Mastermind private guidance; voice evidence SHALL retain recognition, partial-checkpoint and playback uncertainty as defined by the voice-evidence specification.

#### Scenario: Completed exercise
- **WHEN** a drill ends with usable transcripts and recaps
- **THEN** the system stores and displays a report whose derived dimensions and claims link to the supporting transcript evidence

#### Scenario: Insufficient evidence
- **WHEN** the participant ends the drill before providing a substantive response
- **THEN** the report explicitly states that evidence is insufficient and does not invent performance claims or message references
