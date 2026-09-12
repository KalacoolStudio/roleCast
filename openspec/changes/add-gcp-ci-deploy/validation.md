# Validation evidence

Validated on 2026-09-12 in the isolated `roleCast-task-2` worktree on `gcp-ci-deploy`. Implementation is maintained on `gcp-ci-deploy` for review. GitHub production configuration is in place; GCP infrastructure has not been provisioned and no live release has been deployed. Live acceptance task **6.5 remains pending**.

## Integration and versions

Integrated GitHub main `ff312805dcefc58c8473384f2efc103d72fd0d41`, including customizable plots/drills, character assets, live drill stage and stricter model-output contracts. Resolved the API/frontend overlaps while preserving plot authoring, legacy session routes and cloud metadata/disclosures. The storage schema is now **3**; the backup compatibility helper imports the storage schema constant. The other worktree remains on `gpt-live-1-module`; no uncommitted files or processes were imported from it.

| Component | Tested version |
| --- | --- |
| Local Node / npm | 26.7.0 / 11.19.0 |
| Container base | Node 26.7.0 bookworm-slim, pinned manifest `sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32` |
| Native SQLite package | better-sqlite3 13.0.3 |
| Vite / Vitest | 8.3.0 / 5.0.0 |
| Playwright | 1.63.0, Chromium |
| Terraform / Google provider | 1.14.9 / 7.43.0 |
| actionlint / OpenSpec CLI | 1.7.12 / 1.10.0 |
| Local container engine | Docker 29.7.2, isolated rootless daemon with rootlesskit 3.1.0 and slirp4netns 1.3.5 |

Actions are pinned by full commit SHA. Terraform and actionlint release downloads were checksum verified. The final local production image ID is `sha256:c7f52f505320f2e1218df15108bf3dc9bc14826d9ce0625c21ccf623cf5e2968`. This is a local image ID, **not a published Artifact Registry manifest digest**. A registry digest and deployed commit will be recorded by the first successful live workflow.

## Executed checks

| Check | Result |
| --- | --- |
| Locked dependency install and native SQLite loading | Passed locally and during clean container builds |
| `npm run check` | Passed ESLint and Prettier |
| `npm run build` | Passed; integrated plot editor and frontend assets built |
| `npm run test:unit` | **87 tests passed**, 10 files |
| `ROLECAST_TEST_PORT=3312 npm run test:e2e` | **13 tests passed**, including plot editor, live-stage/SSE behavior and cloud disclosure/error recovery |
| `node scripts/gcp/build-image.js rolecast:gcp-ci-deploy` | Passed; disposable nested env sentinel and local env/data excluded |
| `node scripts/gcp/container-smoke.js rolecast:gcp-ci-deploy` | Passed with networking disabled and disposable data/restore volumes |
| Docker image artifact round trip | Save/load preserves the exact tested image ID |
| Terraform format, backend-free init/validate | Passed with pinned provider lockfile |
| `terraform test` | **4 mock-provider tests passed** |
| actionlint and `bash -n` | Passed workflow and shell syntax checks |
| `git diff --check` and merge-conflict inspection | Passed |
| `openspec validate add-gcp-ci-deploy --strict` | Passed |

The container smoke verifies production frontend/API serving, UID 1000, read-only container root, missing-volume rejection, root-run compatibility checks followed by a non-root restart, accepted asynchronous work, interrupted-drill recovery with accepted messages, online backup verification, and restoration to a second disposable volume. It calls no production model provider.

Host tests use real temporary files and `flock`, with Docker/systemd/block-device/cloud adapters. They verify ordering and state transitions, not a running COS VM. They cover pull/secret/mount preflight failures, required-backup and upload failure, stop failure, successful replacement, first-deploy failure, healthy/failed/incompatible rollback, stale/idempotent requests, monotonic generations across rollback, concurrent submissions, reboot transaction recovery, explicit-only blank-disk initialization, wrong-device/signature rejection, restore validation, preservation of SQLite/WAL/SHM, interrupted restore refusal, and preservation of the last successful backup timestamp after a later failure.

COS `/var` is non-executable, so generated units, transient operations and operator commands invoke host scripts using `/bin/bash`. Registry authentication uses the preinstalled `docker-credential-gcr` with a writable Docker config under `/run`. These choices were checked against the [COS filesystem documentation](https://docs.cloud.google.com/container-optimized-os/docs/concepts/disks-and-filesystem) and [container runtime guidance](https://docs.cloud.google.com/container-optimized-os/docs/how-to/run-container-instance).

## Read-only GCP review

The supplied project `project-783f506d-73dd-47d4-96d` is active and billing enabled. Read-only VM and bucket inventory returned no existing resources. GitHub reports repository ID `1366870434`, owner ID `6670851`, and default branch `main`.

A real provider plan using the signed-in Google identity succeeded: **41 to add, 0 to change, 0 to destroy**. It used a temporary local backend and provisional app/admin access for that identity solely to review the proposed resources. It did not create a state bucket, apply IAM policies or provision a VM. The review plan is disposable; rebuild a plan with the approved identities and real GCS backend before applying. Runtime secret payload resources are absent.

The local ignored `infra/gcp/terraform.tfvars` records the supplied project, default Taiwan region/zone and verified repository IDs. Application/administrator identities remain unset. GitHub CLI is authenticated as `Drainet`, now verified to have ADMIN access to the transferred organization repository `KalacoolStudio/roleCast`. The repository ID stayed `1366870434`; the owner ID changed to `6670851`. The read-only plan was regenerated successfully after this transfer with the updated organization trust identity; it still proposes 41 additions and no changes or deletions. Provisional application/admin identities remain subject to the user's selection before apply. Application-default credentials are also absent; the read-only plan used an ephemeral OAuth token from the existing gcloud login without printing or persisting it. Operators can configure ADC as documented for normal Terraform use.

The organization transfer is reflected in Terraform defaults, the ignored local bootstrap settings, and deployment documentation. The `production` GitHub environment has a custom deployment branch rule allowing `main`, no required reviewers, and all seven non-secret GCP variables configured and read back. These variables refer to planned infrastructure; they do not imply the VM or WIF provider already exists.

## Spec scenario coverage

| Requirement and scenarios | Automated evidence / remaining live proof |
| --- | --- |
| Complete release runtime: use app; another drill active | Container asynchronous-work smoke, existing engine/API conflict tests; live authenticated model exercise pending |
| Private access: authorized, unauthorized, unrelated Origin | Terraform IAP/firewall/grant assertions and cloud-runtime Origin tests; actual granted/denied IAP connections and public-port rejection pending |
| Explicit configuration: valid cloud config; missing volume | Cloud-runtime tests, native production-container startup, missing mount smoke, host mount/device adapters |
| Secret isolation: credential-free build; denied secret | Build sentinel check, runtime metadata test, private env-file/denied-fetch tests; VM identity and actual Secret Manager permission check pending |
| Accurate cloud notice | Playwright cloud-mode test verifies GCP, sharing and external-provider notice |
| Local compatibility | Existing unit/integration and browser suite, local defaults and precedence tests; test port isolated from WIP |
| Main automation: merge, unmerged work, manual retry | Workflow triggers/job guards, deploy-config invalid-ref/event tests, main-head checks; actual GitHub execution pending |
| Validation gates: failed check; tested identity | Reusable workflow dependency graph, image smoke and artifact save/load identity; registry publish digest/VM correspondence pending |
| Scoped identity: trusted/untrusted claims | Pinned main/workflow/repository/owner CEL restriction and Terraform assertions; actual OIDC exchange/denial pending |
| Bootstrap: first release; incomplete setup | Complete operator guide, real read-only resource plan, configuration error tests, preflight failures; actual first provision/release pending |
| Serialized releases: overlapping main changes | Real-lock host concurrency tests, monotonic watermark, main-head checks and non-cancelling deploy concurrency |
| Running release: healthy/unhealthy | Host success, health failure, rollback outcomes and production container smoke; live workflow summary pending |
| Persistent records: image/VM replacement | Container replacement/restore plus disk lifecycle configuration and real plan; live VM replacement/reboot persistence pending |
| One writer: active drill restart; concurrent replacement | Container restart interruption, existing storage uniqueness, host stop/lock/concurrent replacement tests |
| Off-VM backups: live WAL; required backup failure | Cloud-data WAL backup leaves active drill untouched; manifest/checksum/receipt tests; host failure/last-success tests; actual GCS object upload pending |
| Release recovery: compatible/incompatible prior image | Host rollback, schema refusal, failed recovery and no-prior-image tests; direct schema helper rejects newer database without migration |
| Explicit restoration: selected/invalid backup | Real isolated-volume restore, checksum corruption rejection, host pre-validation and SQLite/WAL/SHM preservation tests; isolated restore of actual GCS backup pending |

The older unarchived MVP change describes **local** runtime behavior. This change explicitly adds GCP mode and keeps its local defaults; README and UI now distinguish storage/sharing by mode. Main's plot authoring remains a trusted shared workspace. No unrelated changes were archived or rewritten. Recheck integration if main advances again before merge.

## Pending live acceptance — task 6.5

1. Confirm app users and restore/deploy administrators; configure remote state, and review/apply a fresh infrastructure plan. Enter the three production Secret Manager values and record numeric versions separately from Terraform state.
2. Configure GitHub's `production` variables/branch rule and main protection. Merge the reviewed deployment change, or dispatch the workflow at current main after setup. Record run URL, commit, tested image ID, published digest and `host.sh status`.
3. Verify frontend, `/api/health`, `/api/runtime`, plot authoring and one deliberate model exercise through an authorized app-only identity. Verify this identity cannot SSH, an ungranted identity cannot tunnel, and direct internet access to port 8080 fails.
4. Verify that required validation failure blocks deployment and incorrect OIDC claims cannot impersonate the deployment identity. Exercise overlapping updates and a failed candidate in an isolated rehearsal environment, recording distinct failed/rolled-back/skipped outcomes.
5. Retain a test record across a release and VM reboot; confirm an active drill becomes interrupted without losing accepted messages. Record the retained disk identity.
6. Run a live backup, verify private GCS database/manifest objects and status freshness, download with a restore-operator identity, and restore to a separate disposable destination. Confirm plots, drill history and checksum/schema without replacing production data.

Keep task 6.5 unchecked until these live observations are recorded. No automated checks above are claimed as proof that GCP provisioning, GitHub OIDC or a live deployment has succeeded.
