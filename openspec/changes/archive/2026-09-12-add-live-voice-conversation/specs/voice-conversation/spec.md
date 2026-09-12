## Purpose

Let participants conduct Role Cast calls by speaking and hearing the assigned Persona through gpt-live-1, with automatic audio submission, clear controls, and reliable transitions to the existing text experience.

## ADDED Requirements

### Requirement: Voice activation and text fallback

The interface SHALL offer voice activation beside the existing reply composer and when accepting a pending call. Microphone capture SHALL require an explicit user gesture and permission. Starting voice in an existing idle call SHALL preserve its Persona, transcript, and call ID without replaying the opening. A call accepted directly in voice mode SHALL request one spoken opening after readiness. Typed conversation SHALL remain available when voice is unavailable or permission is denied.

#### Scenario: Speak from the current composer
- **WHEN** the participant enables voice during an idle active text call and grants microphone permission
- **THEN** the same call enters voice mode with its existing context, and the participant can speak without pressing「送出」

#### Scenario: Accept directly in voice mode
- **WHEN** a pending call is accepted using its voice option
- **THEN** the assigned Persona gives one spoken opening after initialization, without generating a separate text-mode opening

#### Scenario: Microphone unavailable
- **WHEN** permission is denied, no microphone exists, or the browser lacks supported audio capabilities
- **THEN** the interface explains the failure in Traditional Chinese, releases partially acquired resources, creates no provider session, and leaves text conversation usable

### Requirement: Continuous spoken conversation

Voice mode SHALL stream microphone audio automatically to gpt-live-1 and play its audio responses while continuing to accept microphone input. Spoken replies SHALL NOT require pressing submit, and recognized text SHALL NOT trigger a second text Persona generation. The interface SHALL show connection, microphone, and playback status and automatically display both speakers' captions. It SHALL provide microphone mute, return-to-text, hangup, and finish controls that remain usable during model work.

#### Scenario: Hands-free reply
- **WHEN** the participant responds aloud to the Persona
- **THEN** audio is submitted automatically, the Persona can answer aloud, and both sides appear in captions without an extra message POST or duplicate Persona reply

#### Scenario: Reply while the Persona speaks
- **WHEN** the participant begins speaking during output playback
- **THEN** microphone input continues to reach Live and the conversation can react to that speech without waiting for a submit button or a text-model job

#### Scenario: Mute microphone
- **WHEN** the participant mutes voice input
- **THEN** participant microphone audio is withheld immediately, the interface reports microphone state, and generated speech and session lifetime are not falsely reported as stopped

### Requirement: Natural voice with concurrent evaluation

In voice mode, Persona speech SHALL play while Judge evaluates accumulated evidence independently. A valid stop SHALL prevent further application playback and new microphone submission as soon as the client receives the stop notification. The application SHALL NOT represent speech heard before a stop decision as having been blocked. Existing text-mode replies SHALL retain their approval-before-publication behavior.

#### Scenario: Judge is still evaluating
- **WHEN** a voice checkpoint is being evaluated and the call is active
- **THEN** voice input and output continue without waiting for Judge approval

#### Scenario: Stop during playback
- **WHEN** Judge ends the current voice call while audio is queued or playing
- **THEN** the client stops playback, clears queued audio, disables capture, and ignores later output from that voice attempt

### Requirement: Server ownership and private context

Live credentials, startup instructions, assignment goals, Allowed Facts lists, private evaluations, and raw provider control events SHALL remain behind the server. The browser SHALL receive only participant-visible audio, captions, status, and opaque application identifiers. Voice creation SHALL be bound to a current authorized local call, reject other origins and stale/ended calls, and prevent simultaneous owners from creating multiple Live sessions for one call. The browser SHALL NOT choose arbitrary provider configuration or submit trusted Persona/evaluation records.

#### Scenario: Private provider event
- **WHEN** Live sends a startup, context, delegation, error, or evaluation-related event containing private fields
- **THEN** those raw fields do not appear in browser frames, assets, API responses, or logs

#### Scenario: Two voice activations
- **WHEN** duplicate requests or two tabs attempt to start voice for the same call
- **THEN** at most one owner creates a Live session, and conflicting attempts receive an explicit conflict result

#### Scenario: Canonical drill and legacy clients
- **WHEN** a participant starts voice through the drill API or the compatible session API
- **THEN** reservation and WebSocket attachment enforce the same call identity, ownership, and lifecycle rules

#### Scenario: Same-host HTTPS tunnel
- **WHEN** the application is accessed through an HTTPS tunnel that preserves its Host header
- **THEN** voice reservation and attachment accept that exact HTTPS origin while rejecting a different origin or a match based only on X-Forwarded-Host

### Requirement: Bounded media and failure behavior

Capture, transport, playback, startup, and shutdown SHALL have finite buffer or time bounds. Normal input SHALL preserve sample ordering and handle supported browser sample rates. Unexpected overflow, malformed audio, socket loss, and provider failures SHALL be explicit, release local resources, and retain accepted transcript evidence. The application SHALL NOT silently drop and retry arbitrary audio, accumulate an unbounded recording, or automatically create replacement paid sessions.

#### Scenario: Slow audio transport
- **WHEN** microphone or playback data exceeds its configured queue limit
- **THEN** the voice attempt stops with an understandable error and bounded cleanup, rather than accumulating stale audio or replaying it later

#### Scenario: Provider fails
- **WHEN** a voice connection fails during a call
- **THEN** accepted evidence remains visible, the voice attempt is marked incomplete, and text input becomes available after cleanup if the call itself is still active

### Requirement: Mode transitions and stale work isolation

Starting voice SHALL wait until current text work has settled; typed submissions SHALL be rejected while voice is starting, active, or stopping. Returning to text SHALL end that voice attempt, seal already accepted evidence, and preserve the call. Refresh, page exit, and ownership loss SHALL release capture/playback and initiate bounded server cleanup. A refreshed page SHALL restore saved state without reopening the microphone or a paid session automatically. Old voice callbacks SHALL NOT affect a later voice attempt or another call.

#### Scenario: Switch back to text
- **WHEN** the participant selects「改用文字」during an active voice conversation
- **THEN** voice resources close, accepted captions remain in the same call, and text can continue after the transition without another opening or a Recap for the mode switch

#### Scenario: Refresh during voice
- **WHEN** the participant reloads the page during voice
- **THEN** saved captions/history are restored, the previous voice owner is cleaned up within a finite deadline, and microphone use requires another explicit action

#### Scenario: Late audio from a prior attempt
- **WHEN** an old transport delivers audio or a control result after switching modes or calls
- **THEN** it cannot publish output, alter new input, restart playback, or close the new call

### Requirement: Voice configuration and usage bounds

Server configuration SHALL use the existing `API_KEY` for both Live and text agents, support an optional Live base URL, use gpt-live-1, and default provider recording to disabled. It SHALL NOT require or consume `OPENAI_API_KEY`. Text agents SHALL prefer `API_KEY`, while continuing to accept legacy `LLM_API_KEY` when the shared key is absent or blank; `LLM_BASE_URL` and `LLM_MODEL` SHALL continue to configure text inference. Process environment values SHALL override `.env` for the same variable. Missing shared-key or invalid optional Live configuration SHALL disable only voice features when valid legacy text configuration exists. Public capability responses SHALL contain no secrets and SHALL distinguish configuration availability from verified provider access. Each call SHALL have a cumulative voice duration budget, defaulting to 180 seconds across its voice attempts; existing typed-turn and total-call limits SHALL remain in force for their respective scopes.

#### Scenario: Shared OpenAI credential
- **WHEN** `API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` are configured without a separate voice key
- **THEN** text agents and Live use the same explicit credential, and voice is available without creating a provider session until requested

#### Scenario: Shared key takes precedence
- **WHEN** `API_KEY`, legacy `LLM_API_KEY`, and an obsolete `OPENAI_API_KEY` are all present
- **THEN** both text and Live use `API_KEY`, and the obsolete voice key has no effect

#### Scenario: Text-only setup
- **WHEN** only the legacy `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` configuration is present without `API_KEY`
- **THEN** the text application starts normally and voice displays an unavailable state without attempting Live requests

#### Scenario: Voice duration expires
- **WHEN** the current call exhausts its voice duration budget
- **THEN** the call ends once with a duration-limit reason and proceeds through its normal Recap/report lifecycle; splitting captions or switching voice attempts does not reset that budget

#### Scenario: Editable plot voice budget
- **WHEN** an author saves or imports a plot with a voice duration limit between 1 and 3600 whole seconds
- **THEN** newly created drills snapshot that limit, existing drills retain their original budget, and definitions without a limit default to 180 seconds

### Requirement: Offline voice verification

Automated checks SHALL exercise voice UI, media conversion, lifecycle, privacy, and text regression behavior using controlled audio/model transports without reading real credentials or contacting a paid endpoint. Documentation SHALL distinguish automated coverage from real microphone, model-access, latency, and speech-quality checks.

#### Scenario: No Live account available
- **WHEN** the project validation suite runs without Live credentials
- **THEN** voice behavior and existing text flows can be tested using fixtures and no live-account success is claimed
