## Purpose

Define how the existing single-process application operates on GCP while keeping backend access private, configuration confidential, and local development compatible.

## ADDED Requirements

### Requirement: Complete release runtime
The GCP release SHALL serve the built frontend and backend API from the same browser origin. It SHALL run one application process with execution available between HTTP requests, so accepted asynchronous model operations can finish while the browser polls for results. It SHALL preserve the existing restriction to one active exercise per browser workspace and the existing voice capability when provider access is configured. Voice HTTP and WebSocket requests SHALL use the same browser origin through IAP or the optional gateway defined by `gcp-public-access`.

#### Scenario: Use the deployed application
- **WHEN** an authorized user opens a healthy deployed release and starts an exercise
- **THEN** the frontend loads, API requests reach that release, and accepted model work progresses after the initiating request has returned

#### Scenario: Voice through the private tunnel
- **WHEN** a configured user starts voice from the documented loopback browser URL, whose local port differs from the container port
- **THEN** the same-origin reservation and WebSocket relay are accepted while unrelated origins and forwarded-host spoofing remain rejected

#### Scenario: Another exercise is already active
- **WHEN** the same browser workspace attempts to start an exercise while one is active
- **THEN** the application returns the existing conflict behavior and identifies that workspace's active exercise

### Requirement: Private browser and administrative access
The baseline deployment SHALL require Google Cloud IAP authorization for its documented local tunnel. An explicitly enabled HTTPS gateway SHALL follow `gcp-public-access` and reach only the private backend; its access policy does not change IAP administrative grants. The application and administrative ports SHALL reject direct public internet ingress. Access grants SHALL distinguish application users from deployment administrators; application access alone SHALL NOT grant a VM shell or deployment privileges. Existing browser-origin rejection SHALL remain enabled for untrusted origins.

#### Scenario: Authorized browser access
- **WHEN** a configured application user establishes the documented application tunnel
- **THEN** the user can open the frontend and use its API through a loopback browser URL without receiving VM administrative access

#### Scenario: Unauthorized access
- **WHEN** an ungranted identity attempts an IAP connection or an internet client directly requests the VM's application port
- **THEN** it cannot reach the application or read exercise history

#### Scenario: Cross-origin request through a tunnel
- **WHEN** a browser request includes an unrelated website's Origin header
- **THEN** the application rejects it without performing the requested operation

### Requirement: Explicit runtime configuration
Cloud startup SHALL use configured network binding, port, deployment mode, model settings, and an absolute database path on the mounted persistent data volume. It SHALL fail with setting names and a nonzero exit on invalid configuration, unavailable required secrets, or unavailable persistent storage; it SHALL NOT silently create a database on temporary container storage.

#### Scenario: Cloud configuration is valid
- **WHEN** the required cloud configuration, secrets, and persistent volume are available
- **THEN** the backend starts on the configured container interface and port and uses the configured persistent database

#### Scenario: Persistent volume is missing
- **WHEN** the deployment cannot verify that the intended data disk is mounted
- **THEN** application startup fails before creating or changing a database

### Requirement: Secret isolation
Production credentials SHALL be retrieved at runtime from explicitly configured Secret Manager versions using the runtime identity. The release image, frontend assets, workflow artifacts, Terraform state, logs, and public API responses SHALL NOT contain model credentials or a copied developer `.env` file. Non-secret runtime metadata SHALL disclose only the deployment mode needed by the interface.

#### Scenario: Build without production credentials
- **WHEN** CI builds and tests a release without access to production secrets
- **THEN** the release can be built and validated with controlled fixtures and contains no developer env file or local database

#### Scenario: Secret access fails
- **WHEN** the runtime identity cannot read a configured secret version
- **THEN** startup fails clearly without emitting the secret value or substituting a test provider

### Requirement: Accurate storage and sharing disclosure
In cloud mode, the interface and documentation SHALL state that records are stored in the configured GCP deployment and isolated by browser workspace, and that inference content is sent to the configured model provider. Cloud mode SHALL NOT describe the records as stored only on the user's own machine or imply that browser workspaces are named accounts synchronized between devices.

#### Scenario: Cloud data notice
- **WHEN** a user views the deployed workspace before beginning an exercise
- **THEN** the displayed storage location and sharing description match the cloud deployment, while the external inference disclosure remains visible

### Requirement: Local runtime compatibility
When cloud mode is not configured, existing setup, development, build, start, and test commands SHALL retain their local behavior, including loopback binding, `.env` precedence, local SQLite storage, and offline model fixtures. Cloud prerequisites SHALL NOT be required for local execution.

#### Scenario: Existing local checkout
- **WHEN** a developer uses the existing local configuration and commands
- **THEN** the application works locally without a GCP identity, cloud secrets, or cloud infrastructure
