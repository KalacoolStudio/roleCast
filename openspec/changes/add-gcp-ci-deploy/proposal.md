## Why

Role Cast currently runs only on a developer's machine. Merging a change into `main` should publish a tested release to GCP, including the browser interface, API, and durable exercise records, without disturbing local development or erasing data on redeployment.

## What Changes

- Add GitHub Actions checks for pull requests and automatic production deployment for successful pushes to `main`, including merge commits; allow retrying the current `main` release manually.
- Build the React frontend and Fastify backend into one versioned container, publish it to Artifact Registry, and deploy the tested image by digest.
- Provision a single Compute Engine VM, a separate retained Persistent Disk for SQLite, restricted networking, deployment/runtime identities, Secret Manager resources, and backup storage through documented infrastructure configuration.
- Preserve the current single active exercise and process-local execution model. Serialize replacement of the backend and retain completed records; a restart continues to mark unfinished exercises as interrupted.
- Keep application access private through IAP TCP forwarding, with access granted to explicitly configured trusted users. Provide browser access instructions and accurate cloud data-location messaging.
- Add deployment health checks, compatible-image rollback, scheduled database backups, restoration instructions, and a complete first-deployment checklist.

**Implementation defaults:** Compute Engine with SQLite; one shared workspace for the owner or trusted team; configurable project, region, zone, and resource names. The user approved implementation and supplied project `project-783f506d-73dd-47d4-96d`; the region defaults to `asia-east1`. Trusted access identities and production secret values remain operator inputs. Public multi-user access or Cloud Run would require a different design.

## Capabilities

### New Capabilities

- `gcp-runtime`: Containerized frontend/API execution, private browser access, cloud configuration, and preservation of local development behavior.
- `github-gcp-deployment`: Tested main-branch releases, keyless cloud authentication, infrastructure bootstrap, serialized deployment, and release verification.
- `gcp-data-lifecycle`: Durable single-writer SQLite storage, backup/restore, and data-safe release replacement and recovery.

### Modified Capabilities

- `local-runtime`: Scope the storage disclosure to local versus GCP mode, preserving secret isolation and local defaults. Main has consolidated the text, plots, stage and voice requirements into canonical specs; this change builds on that baseline without rewriting archived changes.

## Impact

Expected implementation areas: `.github/workflows/`, container files, `infra/gcp/`, deployment/backup helpers, server configuration and startup, a public non-secret runtime-mode response, frontend data-location labels, tests, and deployment documentation. Existing SQLite schemas and the LLM adapter contract remain compatible.

GCP billing and an initial administrator-run bootstrap are required before automatic deployment can operate. Real secrets are entered separately into Secret Manager. This proposal creates no cloud resources and publishes no release.

## Non-Goals

Public sign-up, per-user histories, parallel independent exercises, a PostgreSQL migration, autoscaling, zero-downtime deployment, new voice features, a custom domain, and changes to the other worktree's ongoing GPT Live work.
