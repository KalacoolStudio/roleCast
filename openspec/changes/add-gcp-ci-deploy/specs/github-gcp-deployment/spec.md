## Purpose

Specify the observable release workflow from a main-branch change to a verified GCP deployment, including infrastructure prerequisites, authentication boundaries, and failure reporting.

## ADDED Requirements

### Requirement: Main branch release automation
The repository SHALL run validation for pull requests targeting `main` and for pushes to `main`. A successful push to `main`, including a merged pull request, SHALL automatically make its commit eligible for production deployment. A manual retry SHALL be permitted only for the current `main` commit. Pull requests, unmerged feature branches, and other manual refs SHALL NOT deploy or obtain production cloud credentials.

#### Scenario: Merge into main
- **WHEN** a pull request is merged into `main` and its resulting commit passes required checks
- **THEN** the workflow publishes and deploys a release for that main-branch commit without a separate per-release approval step

#### Scenario: Unmerged work
- **WHEN** a pull request or feature-branch workflow runs
- **THEN** it can perform validation but cannot authenticate as the production deployment identity or modify production

#### Scenario: Manual retry
- **WHEN** an operator retries deployment from the current `main` ref
- **THEN** validation and release verification still apply; a retry targeting another ref is rejected

### Requirement: Validation gates the deployed artifact
Production deployment SHALL require dependency installation from the lockfile, code checks, frontend build, unit/integration tests, browser tests, and a container smoke check. Tests SHALL use controlled model fixtures without paid provider calls. The production release SHALL use the same image digest that passed container validation, with its source commit recorded.

#### Scenario: A check fails
- **WHEN** a required check or container smoke check fails
- **THEN** the candidate is not deployed and the existing release remains available

#### Scenario: Tested release identity
- **WHEN** production reports a successful deployment
- **THEN** the workflow summary identifies the deployed commit and immutable image digest that passed validation

### Requirement: Keyless scoped cloud identity
The production workflow SHALL authenticate through GitHub OIDC and GCP Workload Identity Federation without a service-account key file. Cloud trust SHALL restrict access to the configured repository and owner identities, the designated deployment workflow, and `refs/heads/main`. Validation jobs SHALL NOT receive production identity permissions. The deployment identity SHALL have only the resource access needed for release operations.

#### Scenario: Trusted workflow
- **WHEN** the designated main-branch deployment job requests a short-lived cloud identity
- **THEN** it can publish its image and perform the configured deployment operations

#### Scenario: Untrusted claims
- **WHEN** a token is issued for another repository, owner, branch, or workflow
- **THEN** the cloud trust policy rejects it even if the job knows the provider and service-account names

### Requirement: Reproducible infrastructure bootstrap
The repository SHALL provide parameterized infrastructure configuration and a first-run guide covering required APIs, network access, runtime and deployment identities, an image repository, persistent data storage, backup storage, secret resources, and private application access. Initial infrastructure creation SHALL be a separate administrator operation, after which routine main-branch releases SHALL run automatically. Bootstrap SHALL NOT upload developer data or secret values automatically.

#### Scenario: First deployment
- **WHEN** an administrator supplies the documented project settings, provisions the infrastructure, adds runtime secret versions, and configures GitHub's production variables
- **THEN** the current `main` release can deploy through the documented workflow without manually creating missing runtime resources

#### Scenario: Incomplete setup
- **WHEN** required deployment variables, resources, or permissions are missing
- **THEN** the workflow fails its preflight with actionable missing-setting information before replacing the running application

### Requirement: Serialized releases and stale-run protection
Production release changes SHALL be serialized across automated and manual executions. A newer run SHALL NOT cancel a replacement already in progress. A superseded main-branch run SHALL NOT overwrite a more recent deployed commit. Superseded runs SHALL be reported as skipped rather than deployed.

#### Scenario: Overlapping main branch updates
- **WHEN** two main-branch releases finish validation out of order
- **THEN** deployment operations do not overlap and the older candidate cannot replace a newer deployed release

### Requirement: Verify the running release
After replacement, the workflow SHALL verify the frontend response and backend database health without invoking the model provider. Success SHALL require all checks to pass. A failure SHALL report the candidate's identity and whether a compatible previous release was recovered, and SHALL remain a failed deployment even if recovery succeeds.

#### Scenario: Healthy replacement
- **WHEN** the candidate serves the frontend and a healthy API/database response
- **THEN** its digest is recorded as the successful release and the workflow publishes the private access instructions

#### Scenario: Unhealthy replacement
- **WHEN** the candidate fails startup or post-deployment checks
- **THEN** the workflow follows the data-safe recovery contract and reports failure with the recovery outcome
