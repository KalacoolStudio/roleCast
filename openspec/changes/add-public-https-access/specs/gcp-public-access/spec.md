## Purpose

Provide browser-accessible HTTPS entry to the deployed application while retaining private backend storage, explicit access policy and the existing streaming behavior.

## ADDED Requirements

### Requirement: Stable HTTPS browser address
An enabled gateway SHALL provide a stable Google-hosted HTTPS URL with a browser-trusted certificate. The built frontend, API, server events and voice WebSocket SHALL share that browser origin without requiring a local tunnel. The application process and SQLite database SHALL remain on the retained VM disk, with existing backups and asynchronous work preserved.

#### Scenario: Open the deployed application
- **WHEN** a visitor permitted by the configured gateway policy opens its HTTPS URL
- **THEN** the frontend and API are available directly in the browser and cloud workspace behavior is preserved

#### Scenario: Application release changes
- **WHEN** a new main-branch release replaces the VM application
- **THEN** the gateway URL remains unchanged and subsequently serves that release using the same retained database

### Requirement: Explicit gateway access policy
The gateway SHALL start without anonymous access unless its configuration explicitly selects anonymous mode. In IAP mode it SHALL require Google sign-in and the configured HTTPS application-access grant. In anonymous mode it SHALL allow ordinary browser visitors to create their own workspace; workspace isolation SHALL still restrict every record and operation. Gateway access SHALL NOT grant VM shell, deployment, backup-reading or model-secret privileges.

#### Scenario: Google sign-in mode
- **WHEN** an unauthenticated or ungranted visitor requests an IAP-protected URL
- **THEN** authentication or authorization prevents access to the application, while an approved identity can use it without a local tunnel

#### Scenario: Anonymous mode
- **WHEN** the operator explicitly selects anonymous access and two fresh browsers open the URL
- **THEN** each receives its own workspace, can read only its own records, and cannot access another workspace by guessing resource IDs

#### Scenario: Legacy data before anonymous access
- **WHEN** previously shared records are migrated before the gateway becomes anonymously accessible
- **THEN** they remain in an operator-controlled workspace and are not awarded to an arbitrary first public visitor

### Requirement: Private upstream and confidential gateway
Only the gateway's dedicated private network range and existing IAP sources SHALL reach the VM application port. Direct public VM application and SSH ingress SHALL remain blocked. The gateway SHALL use only a configured fixed upstream and SHALL NOT accept a visitor-selected target. It SHALL have no model secret, database volume or permission to read private backups.

#### Scenario: Public backend bypass
- **WHEN** an internet client attempts the VM application or SSH port directly
- **THEN** the request cannot reach those services, even while the public gateway is healthy

#### Scenario: Upstream failure
- **WHEN** the VM application is unavailable
- **THEN** the gateway returns a bounded failure rather than initializing another application or temporary database

### Requirement: Preserve browser security and streaming
The gateway SHALL preserve the original browser Host, Origin and workspace cookie, communicate the HTTPS scheme to the application, and reject malformed transport requests without forwarding them to arbitrary targets. API responses SHALL retain their private cache policy. Streaming events SHALL arrive incrementally, and voice WebSockets SHALL support bidirectional frames and the configured call duration. Unrelated Origin headers SHALL remain rejected by the application.

#### Scenario: Secure workspace resume
- **WHEN** a browser initializes or resumes its workspace through public HTTPS
- **THEN** the HttpOnly workspace cookie is Secure and subsequent requests access the same workspace without revealing its credential to frontend JavaScript

#### Scenario: Live streams
- **WHEN** the application sends events or exchanges voice frames through the gateway
- **THEN** they are forwarded promptly without whole-response buffering, and connection closure propagates to release backend resources

#### Scenario: Forged origin
- **WHEN** a gateway request carries an unrelated Origin or a spoofed forwarded-host value
- **THEN** the spoofed header does not authorize application or voice operations

### Requirement: Reproducible gateway operations
The gateway image SHALL be pinned by immutable digest, its configuration and infrastructure SHALL be versioned, and CI SHALL exercise forwarding, cookies and streaming without production credentials. Operators SHALL be able to inspect the configured public URL and disable gateway access while retaining IAP administration, the VM and its data.

#### Scenario: Disable public access
- **WHEN** an operator returns the gateway to restricted invocation
- **THEN** anonymous traffic stops while IAP administration and stored application data remain available
