## Purpose

Provide a reusable server-side wrapper for OpenAI's `gpt-live-1` Live API so callers can manage voice sessions, exchange audio and events, and connect their own orchestration later.

## ADDED Requirements

### Requirement: Independent JavaScript module

The wrapper SHALL be importable as a JavaScript ESM workspace package with a documented public entry point. Importing or constructing the client SHALL NOT start network requests, load or modify `.env`, access SQLite, or require the Role Cast application to be running. Using the existing application SHALL NOT require Live credentials or activate the new wrapper.

#### Scenario: Import without application configuration
- **WHEN** a consumer imports the package without application environment variables
- **THEN** the import succeeds without network, filesystem, or database side effects

#### Scenario: Existing text training
- **WHEN** the current application starts with only its existing `LLM_*` configuration
- **THEN** its Chat Completions training flow continues without creating Live sessions

### Requirement: Explicit server-side configuration

The client SHALL accept an explicit API key and optional API base URL, default to `https://api.openai.com/v1`, and create sessions with model `gpt-live-1`. It SHALL validate required values before networking and identify invalid fields without exposing their contents. Session configuration SHALL support conversation instructions, initial text history, voice, and explicit client or Responses delegation; client delegation and disabled provider recording SHALL be the defaults. Responses delegation SHALL require an explicit backend model. Credentials SHALL remain server-side and SHALL NOT be put in URLs, public configuration, errors, or logs. The module SHALL NOT reuse `LLM_*` settings implicitly.

#### Scenario: Separate voice and text providers
- **WHEN** a caller supplies Live credentials independently of the application's text-model configuration
- **THEN** only the supplied Live configuration determines the voice connection

#### Scenario: Invalid configuration
- **WHEN** an API key is blank, a base URL contains embedded credentials, or Responses delegation lacks a backend model
- **THEN** the operation fails locally with a configuration error and no request is sent

### Requirement: Primary WebSocket session lifecycle

The wrapper SHALL create authenticated primary Live WebSocket sessions and SHALL report readiness only after receiving `session.started`. It SHALL send startup configuration once, reject audio or application commands before readiness or after shutdown begins, and preserve the returned opaque session ID. Startup SHALL support a configurable finite deadline and caller cancellation. A failed or cancelled startup SHALL release its transport and listeners without automatically retrying or reconnecting.

#### Scenario: Transport opens before session starts
- **WHEN** the WebSocket opens but `session.started` has not arrived
- **THEN** the wrapper has sent startup configuration but does not report the session ready or accept audio

#### Scenario: Cancelled or timed-out startup
- **WHEN** the caller cancels startup or the configured deadline expires
- **THEN** startup rejects with a classified error, releases resources, and ignores late startup events

### Requirement: WebRTC creation and sideband control

The wrapper SHALL exchange a caller-provided SDP offer for a Live WebRTC session and return the opaque session ID and SDP answer without credentials. It SHALL reject empty offers and malformed success responses. It SHALL allow a server-side sideband connection to the returned session ID without starting a second session or resending startup configuration. Sideband readiness SHALL describe an attached control transport, not claim that primary media has started. The wrapper SHALL distinguish disconnecting a sideband from explicitly ending the remote session, and SHALL reject input-audio submission on a sideband.

#### Scenario: Browser offer exchange
- **WHEN** a caller supplies a valid offer and the provider returns a valid session and SDP answer
- **THEN** the wrapper returns those identifiers and the answer for the caller to apply, without sending a WebSocket startup event or including an explicitly selected WebSocket audio format

#### Scenario: Attach and detach
- **WHEN** a caller attaches a sideband and later disconnects only that control connection
- **THEN** the wrapper targets the same opaque session ID, sends no new session-start or session-close command, and releases its local resources

### Requirement: Audio and event preservation

The wrapper SHALL support raw mono PCM16LE audio at 24 kHz for primary WebSocket input and output. It SHALL reject malformed audio input and bound its outgoing transport buffer; exceeding that bound SHALL report backpressure without silently dropping or indefinitely buffering audio. It SHALL expose events through a subscription installed before connection startup, preserve transcript fragments and their timestamps, preserve delegation IDs and nested Responses envelopes, and tolerate additional event types and optional fields. It SHALL NOT manufacture turn-completed or audio-played events, trim transcript text, or treat transcript fragments as completed training messages. Provider error events SHALL use the sanitized error contract.

#### Scenario: Overlapping transcript fragments
- **WHEN** user and assistant transcript deltas arrive with overlapping intervals and significant whitespace
- **THEN** each fragment, speaker, and original interval is delivered without rewriting or assigning a completed-turn meaning

#### Scenario: Audio backpressure
- **WHEN** accepting the next audio chunk would exceed the configured outgoing buffer limit
- **THEN** the wrapper rejects that submission with a backpressure error and leaves retry or capture policy to the caller

#### Scenario: Additive provider events
- **WHEN** an unfamiliar event type or a reflected audio event without an event ID is received
- **THEN** the wrapper forwards the event without failing solely because of its type or missing optional event ID

### Requirement: Explicit context and delegation commands

The wrapper SHALL expose client-delegation notifications and allow callers to append instructions, quiet context, and spoken commentary with an explicit delegation ID or `null`. It SHALL offer input mute/unmute and a lower-level event-send operation for other documented Live commands. Convenience commands SHALL correlate acknowledgments and errors to outgoing event IDs, reject when the provider rejects a command, and use finite waits with cancellation. The wrapper SHALL NOT execute delegated work, infer a task from delegation metadata, or interpret a command acknowledgment as proof of spoken delivery. Cancelling a local wait SHALL NOT be described as undoing a command already sent.

#### Scenario: Returning a client-delegation result
- **WHEN** a caller receives delegation metadata, performs its own work, and submits commentary using that delegation ID
- **THEN** the wrapper preserves the ID and resolves the command only on its matching acknowledgment, without executing work itself

#### Scenario: Provider rejects an update
- **WHEN** the provider returns an error correlated to an outgoing command
- **THEN** only the matching pending command rejects and unrelated commands and valid session events remain usable

### Requirement: Bounded shutdown and reliable finalization

Explicit session shutdown SHALL send at most one close command per connection, stop accepting new work, and keep receiving events until `session.closed` or a finite configurable deadline. Repeated close calls SHALL share the same terminal result. Confirmed finalization SHALL return the provider's final usage and reason even when the reason reports an abnormal session end. A timeout, cancellation, or transport loss without `session.closed` SHALL report incomplete finalization, release local resources, and avoid presenting partial usage as final. The module SHALL perform no automatic retries of creation or commands.

#### Scenario: Graceful close requested twice
- **WHEN** two callers request shutdown and the provider emits `session.closed`
- **THEN** one close command is sent, both callers receive the same finalization result, and resources are released

#### Scenario: Socket disappears before the final event
- **WHEN** the socket closes without a `session.closed` event
- **THEN** the wrapper reports incomplete finalization and rejects pending work without claiming final usage or opening a replacement session

### Requirement: Safe failures and offline verification

The wrapper SHALL expose stable error categories for invalid configuration/input, authentication, rejected requests, rate limiting, unavailable service, cancellation, timeout, protocol failure, invalid lifecycle state, backpressure, and incomplete finalization. Public errors SHALL omit raw provider bodies, authorization headers, secret-bearing URLs, and unsanitized nested causes. Automated tests SHALL use injected transports or loopback providers without reading real credentials or calling paid APIs. Documentation SHALL include separate WebSocket and WebRTC/sideband examples, cleanup behavior, and the limitations relevant to integrating with Role Cast.

#### Scenario: Provider echoes a secret in an error
- **WHEN** an HTTP or WebSocket error includes the credential in its message or nested data
- **THEN** the caller receives a classified error whose message and serialized fields do not contain that credential or raw error body

#### Scenario: Validate without a Live account
- **WHEN** the project's automated validation runs with no Live credentials
- **THEN** wrapper protocol tests and existing regression tests run against controlled fixtures, and live-account access is not claimed as verified
