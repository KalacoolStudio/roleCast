## MODIFIED Requirements

### Requirement: Server ownership and private context

Live credentials, startup instructions, assignment goals, explicitly shared user messages, private evaluations, and raw provider control events SHALL remain behind the server. The browser SHALL receive only participant-visible audio, captions, status, and opaque application identifiers. Voice creation SHALL be bound to a current authorized local call, reject other origins and stale/ended calls, and prevent simultaneous owners from creating multiple Live sessions for one call. The browser SHALL NOT choose arbitrary provider configuration or submit trusted Persona/evaluation records.

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
