# voice-conversation Specification

## Purpose

Let participants conduct Role Cast calls entirely by speaking and hearing the assigned Persona through gpt-live-1, with automatic audio submission, clear controls, and reliable recovery.

## Requirements

### Requirement: Voice-only activation

The interface SHALL offer only voice activation when accepting or reopening a pending call and SHALL NOT expose a reply composer or typed-message action. Microphone capture SHALL require an explicit user gesture and permission. A call accepted directly in voice mode SHALL request one spoken opening after readiness. Starting voice after a failed attempt SHALL preserve its Persona, transcript, and call ID without replaying the opening.

#### Scenario: Accept directly in voice mode
- **WHEN** a pending call is accepted using its voice option
- **THEN** the assigned Persona gives one spoken opening after initialization, without generating a separate text-mode opening

#### Scenario: Microphone unavailable
- **WHEN** permission is denied, no microphone exists, or the browser lacks supported audio capabilities
- **THEN** the interface explains the failure in Traditional Chinese, releases partially acquired resources, creates no provider session, and offers manual voice retry

### Requirement: Continuous spoken conversation

Voice mode SHALL stream detected microphone speech automatically to gpt-live-1 and play its audio responses while continuing to accept microphone input. Spoken replies SHALL NOT require pressing submit, and recognized text SHALL NOT trigger a second Persona generation. The interface SHALL show connection, microphone, and playback status and automatically display both speakers' captions. It SHALL provide microphone mute, hangup, and finish controls that remain usable during model work.

Client capture SHALL combine browser echo cancellation and noise suppression with adaptive voice activity detection. The detector SHALL adapt to steady room noise, retain bounded prefix and trailing speech, raise its start threshold during local output, and continue to permit deliberate barge-in.

#### Scenario: Hands-free reply
- **WHEN** the participant responds aloud to the Persona
- **THEN** audio is submitted automatically, the Persona can answer aloud, and both sides appear in captions without an extra message POST or duplicate Persona reply

#### Scenario: Reply while the Persona speaks
- **WHEN** the participant begins speaking during output playback
- **THEN** microphone input continues to reach Live and the conversation can react to that speech without waiting for a submit button or a text-model job

#### Scenario: Mute microphone
- **WHEN** the participant mutes voice input
- **THEN** participant microphone audio is withheld immediately, the interface reports microphone state, and generated speech and session lifetime are not falsely reported as stopped

#### Scenario: Background noise and speaker leakage
- **WHEN** steady ambient noise or local Persona playback reaches the microphone without clear participant speech
- **THEN** the client withholds those frames while retaining the beginning and end of the next detected utterance

### Requirement: Natural voice with concurrent evaluation

In voice mode, Persona speech SHALL play while Judge evaluates accumulated evidence independently. A valid stop SHALL prevent further application playback and new microphone submission as soon as the client receives the stop notification. The application SHALL NOT represent speech heard before a stop decision as having been blocked.

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

Capture, transport, playback, startup, and shutdown SHALL have finite buffer or time bounds. Normal input SHALL preserve sample ordering and handle supported browser sample rates. Transient media congestion SHALL discard bounded stale frames and continue with current audio; it SHALL NOT accumulate an unbounded recording or end an otherwise healthy call. Malformed audio, socket loss, persistent timeout, and provider failures SHALL be explicit, release local resources, and retain accepted transcript evidence. The application SHALL NOT automatically create replacement paid sessions.

#### Scenario: Slow audio transport
- **WHEN** microphone or playback data exceeds its configured queue limit
- **THEN** stale frames are discarded within fixed bounds and subsequent current audio continues without closing the voice attempt

#### Scenario: Provider fails
- **WHEN** a voice connection fails during a call
- **THEN** accepted evidence remains visible, the voice attempt is marked incomplete, and manual voice retry becomes available if the call itself is still active

### Requirement: Voice retry and stale work isolation

The participant interface SHALL reject typed submissions. Stopping or losing voice SHALL seal already accepted evidence and preserve an active call for an explicit retry. Refresh, page exit, and ownership loss SHALL release capture/playback and initiate bounded server cleanup. A refreshed page SHALL restore saved state without reopening the microphone or a paid session automatically. Old voice callbacks SHALL NOT affect a later voice attempt or another call.

#### Scenario: Refresh during voice
- **WHEN** the participant reloads the page during voice
- **THEN** saved captions/history are restored, the previous voice owner is cleaned up within a finite deadline, and microphone use requires another explicit action

#### Scenario: Late audio from a prior attempt
- **WHEN** an old transport delivers audio or a control result after switching modes or calls
- **THEN** it cannot publish output, alter new input, restart playback, or close the new call

### Requirement: Voice configuration and usage bounds

Server configuration SHALL use the existing `API_KEY` for both Live and text agents, support an optional Live base URL, use gpt-live-1, and default provider recording to disabled. It SHALL NOT require or consume `OPENAI_API_KEY`. Text agents SHALL prefer `API_KEY`, while continuing to accept legacy `LLM_API_KEY` when the shared key is absent or blank; `LLM_BASE_URL` and `LLM_MODEL` SHALL continue to configure text inference. Process environment values SHALL override `.env` for the same variable. Missing shared-key or invalid optional Live configuration SHALL disable only voice features when valid legacy text configuration exists. Public capability responses SHALL contain no secrets and SHALL distinguish configuration availability from verified provider access. Each call SHALL have a cumulative voice duration budget of at most 600 seconds across its voice attempts; existing typed-turn and total-call limits SHALL remain in force for their respective scopes.

#### Scenario: Shared OpenAI credential
- **WHEN** `API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` are configured without a separate voice key
- **THEN** text agents and Live use the same explicit credential, and voice is available without creating a provider session until requested

#### Scenario: Shared key takes precedence
- **WHEN** `API_KEY`, legacy `LLM_API_KEY`, and an obsolete `OPENAI_API_KEY` are all present
- **THEN** both text and Live use `API_KEY`, and the obsolete voice key has no effect

#### Scenario: Text-only setup
- **WHEN** only the legacy `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` configuration is present without `API_KEY`
- **THEN** the application displays voice as unavailable, disables starting a new drill, and does not attempt a Live request

#### Scenario: Voice duration expires
- **WHEN** the current call exhausts its voice duration budget
- **THEN** the call ends once with a duration-limit reason and proceeds through its normal Recap/report lifecycle; splitting captions or switching voice attempts does not reset that budget

#### Scenario: Editable plot voice budget
- **WHEN** an author saves or imports a plot with a voice duration limit between 1 and 600 whole seconds
- **THEN** newly created drills snapshot that limit, definitions without a limit default to 600 seconds, values above 600 seconds are rejected, existing lower budgets remain valid, and runtime caps any legacy higher budget at 600 seconds

### Requirement: Offline voice verification

Automated checks SHALL exercise voice UI, media conversion, lifecycle, privacy, and text regression behavior using controlled audio/model transports without reading real credentials or contacting a paid endpoint. Documentation SHALL distinguish automated coverage from real microphone, model-access, latency, and speech-quality checks.

#### Scenario: No Live account available
- **WHEN** the project validation suite runs without Live credentials
- **THEN** voice behavior and existing text flows can be tested using fixtures and no live-account success is claimed
