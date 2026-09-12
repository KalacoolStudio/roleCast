# Validation evidence

Validated on 2026-09-12 in the isolated `roleCast-task-2` worktree on `gcp-ci-deploy`. Implementation is maintained on `gcp-ci-deploy` for review. GCP infrastructure, approved access, pinned Secret Manager values and GitHub production configuration are provisioned and verified. The PR has not been merged and no application release has been deployed. Live acceptance task **6.5 remains pending**.

## Integration and versions

Integrated GitHub main `8a66cfed48d45722eed1cdae3b6874fa35d68214`, including customizable plots/drills, refreshed stage artwork, GPT Live voice and the consolidated canonical specs. Resolved configuration, API, frontend, storage and browser-fixture conflicts while preserving the existing features and cloud metadata/disclosures. The storage schema is now **4**; the backup compatibility helper imports the storage schema constant. The concurrent worktree continues independently; no uncommitted files or processes were imported from it.

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

Actions are pinned by full commit SHA. Terraform and actionlint release downloads were checksum verified. The final local production image ID is `sha256:f87baf300ff5c9bd74a1143d8756d09b3a30efd3e6cfa1e9aab4a8b06239df37`. This is a local image ID, **not a published Artifact Registry manifest digest**. A registry digest and deployed commit will be recorded by the first successful live workflow.

## Executed checks

| Check | Result |
| --- | --- |
| Locked dependency install and native SQLite loading | Passed locally and during clean container builds |
| `npm run check` | Passed ESLint and Prettier |
| `npm run build` | Passed; integrated plot editor and frontend assets built |
| `npm run test:unit` | **222 tests passed**, 18 files |
| `ROLECAST_TEST_PORT=3312 npm run test:e2e` | **19 tests passed**, including plots, live-stage/SSE, voice controls/recovery/evidence and cloud disclosures |
| `node scripts/gcp/build-image.js rolecast:gcp-ci-deploy` | Passed; disposable nested env sentinel and local env/data excluded |
| `node scripts/gcp/container-smoke.js rolecast:gcp-ci-deploy` | Passed with networking disabled and disposable data/restore volumes |
| Docker image artifact round trip | Save/load preserves the exact tested image ID |
| Terraform format, backend-free init/validate | Passed with pinned provider lockfile |
| `terraform test` | **4 mock-provider tests passed** |
| actionlint with ShellCheck 0.11.0 and `bash -n` | Passed workflow and shell checks |
| Earlier GitHub CI before voice integration | Both application and infrastructure jobs passed: [run 34676334533](https://github.com/KalacoolStudio/roleCast/actions/runs/34676334533); the integrated head is checked separately on the PR |
| `git diff --check` and merge-conflict inspection | Passed |
| `openspec validate add-gcp-ci-deploy --strict` | Passed |

The integrated runtime maps the existing `rolecast-llm-api-key` secret to main's shared `API_KEY`, preserving the three approved secret payloads and resource names. The approved text endpoint is OpenAI and this value matches the pre-existing shared key. A configuration-boundary test verifies the fetched env file enables both text and voice configuration; the production container also checks public voice capability without contacting a model provider. Actual paid-provider voice/media acceptance remains distinct from these fixture checks.

Voice origin validation now accepts same-host loopback HTTP from the IAP forwarding port, which differs from the backend port. Regression tests exercise the real reservation and WebSocket/PCM path with controlled voice clients, reject unrelated origins, and reject spoofed `X-Forwarded-Host`. Existing HTTPS tunnel behavior remains covered.

The container smoke verifies production frontend/API serving, UID 1000, read-only container root, missing-volume rejection, root-run compatibility checks followed by a non-root restart, accepted asynchronous work, interrupted-drill recovery with accepted messages, online backup verification, and restoration to a second disposable volume. It calls no production model provider.

Host tests use real temporary files and `flock`, with Docker/systemd/block-device/cloud adapters. They verify ordering and state transitions, not a running COS VM. They cover pull/secret/mount preflight failures, required-backup and upload failure, stop failure, successful replacement, first-deploy failure, healthy/failed/incompatible rollback, stale/idempotent requests, monotonic generations across rollback, concurrent submissions, reboot transaction recovery, explicit-only blank-disk initialization, wrong-device/signature rejection, restore validation, preservation of SQLite/WAL/SHM, interrupted restore refusal, and preservation of the last successful backup timestamp after a later failure.

COS `/var` is non-executable, so generated units, transient operations and operator commands invoke host scripts using `/bin/bash`. Registry authentication uses the preinstalled `docker-credential-gcr` with a writable Docker config under `/run`. These choices were checked against the [COS filesystem documentation](https://docs.cloud.google.com/container-optimized-os/docs/concepts/disks-and-filesystem) and [container runtime guidance](https://docs.cloud.google.com/container-optimized-os/docs/how-to/run-container-instance).

## Applied GCP bootstrap and live preflight

Project `project-783f506d-73dd-47d4-96d` (number `409197180949`) is active and billing enabled. The user approved `drain.cy.chang@gmail.com` for both application and administrator access and explicitly approved reusing only the three existing LLM settings. GitHub CLI is authenticated as `Drainet`, with ADMIN access to `KalacoolStudio/roleCast`; the stable repository ID is `1366870434` and organization owner ID is `6670851`.

Created the private Terraform state bucket `gs://project-783f506d-73dd-47d4-96d-rolecast-tfstate` in `asia-east1`, with uniform bucket IAM, enforced public-access prevention and versioning. The actual checkout uses its `rolecast/production` GCS backend. A fresh reviewed plan and apply completed with **41 added, 0 changed, 0 destroyed**. Runtime secret payloads are not Terraform resources. Terraform used a short-lived OAuth token from the existing gcloud login only in its process environment; no token was printed, persisted or placed in backend configuration.

The resulting VM is `rolecast` in `asia-east1-b`, with COS image `cos-stable-121-18867-584-7`. The dedicated `rolecast-data` disk initialized successfully as ext4, label `rolecast-data`, UUID `e6f3dac6-28f2-4ccf-8ef9-98f2f6dbe194`. The app directory is UID/GID `1000:1000`, mode 0700; state and backup directories are root-owned, mode 0700. After initial preparation, `initialize_data_disk` was set to **false**. A second reviewed apply changed only VM startup metadata (**0 added, 1 changed, 0 destroyed**). The final real Terraform plan returned **no changes** after reboot.

A controlled reboot loaded the disabled initialization setting and retained the same disk UUID and a disposable persistence marker. The kernel device name changed from `/dev/sdb` to `/dev/sda`; the stable `/dev/disk/by-id/google-rolecast-data` lookup and mount verification succeeded. The marker was then removed. Disk preparation and the daily backup timer are active. The app reports `Awaiting first deployment`; no production SQLite database has been created.

The three approved values were written directly to Secret Manager through stdin and verified byte-for-byte without displaying them. All pinned references use version **1**:

- `rolecast-llm-api-key/versions/1`
- `rolecast-llm-base-url/versions/1`
- `rolecast-llm-model/versions/1`

An isolated container on the VM verified metadata identity, all three secret reads and value formats, the preinstalled Artifact Registry credential helper, repository read permission, and upload of a non-secret permission probe into the private backup bucket. The upload receipt's size and MD5 matched. The probe object is `backups/preflight/59c6b740-81e9-4276-a8d7-f5a72570c737.json` and follows the bucket's 30-day expiry; it contains no application data or credentials. Secret access still worked after reboot. One tiny authenticated Chat Completions request to the configured model provider succeeded from the VM without recording provider credentials or response text.

A disposable credential-free HTTP listener on port 8080 verified successful access through the approved user's IAP tunnel and blocked direct public access while the listener was healthy. The listener and local tunnel were removed. This proves the network path, not application health or app-only/ungranted identity behavior: the approved account is also a project owner and administrator. Those narrower access tests remain part of live acceptance.

The GitHub `production` environment permits only the `main` branch, has no required deployment reviewers, and contains all seven non-secret variables. Every value was compared against the **applied** Terraform outputs and matched. WIF is provisioned with the repository ID, organization ID, main ref and deployment workflow restriction. Actual GitHub OIDC exchange and registry publication await a main-branch deployment. Existing main branch protection/rulesets were inspected and are absent; the deployment workflow's own validation gates still run for main pushes. The guide explains protection if the team wants to enforce PR-only changes.

Bootstrap logs and receipts are stored under the ignored local `.tmp/` directory. This evidence distinguishes permission probes and disk persistence from the application/database acceptance checks below; it does not claim a live application deployment or actual database backup/restore.

## Spec scenario coverage

| Requirement and scenarios | Automated evidence / remaining live proof |
| --- | --- |
| Complete release runtime: use app; another drill active | Container asynchronous-work smoke, existing engine/API conflict tests; live authenticated model exercise pending |
| Private access: authorized, unauthorized, unrelated Origin | Terraform IAP/firewall/grant assertions and cloud-runtime Origin tests; approved-owner IAP routing and public-port rejection passed with a disposable listener; app-only/ungranted identity and real-app checks pending |
| Explicit configuration: valid cloud config; missing volume | Cloud-runtime tests, native production-container startup, missing mount smoke, host mount/device adapters |
| Secret isolation: credential-free build; denied secret | Build sentinel check, runtime metadata test, private env-file/denied-fetch tests; actual VM identity reads, reboot access and provider connectivity passed |
| Accurate cloud notice | Playwright cloud-mode test verifies GCP, sharing and external-provider notice |
| Local compatibility | Existing unit/integration and browser suite, local defaults and precedence tests; test port isolated from WIP |
| Main automation: merge, unmerged work, manual retry | Workflow triggers/job guards, deploy-config invalid-ref/event tests, main-head checks; PR CI passed; actual main deployment pending |
| Validation gates: failed check; tested identity | Reusable workflow dependency graph, image smoke and artifact save/load identity; registry publish digest/VM correspondence pending |
| Scoped identity: trusted/untrusted claims | Pinned main/workflow/repository/owner CEL restriction and Terraform assertions; actual OIDC exchange/denial pending |
| Bootstrap: first release; incomplete setup | Complete operator guide, successful real apply and VM/secret/network preflight, configuration error tests; first release pending |
| Serialized releases: overlapping main changes | Real-lock host concurrency tests, monotonic watermark, main-head checks and non-cancelling deploy concurrency |
| Running release: healthy/unhealthy | Host success, health failure, rollback outcomes and production container smoke; live workflow summary pending |
| Persistent records: image/VM replacement | Container replacement/restore plus disk lifecycle configuration and real plan; live VM replacement/reboot persistence pending |
| One writer: active drill restart; concurrent replacement | Container restart interruption, existing storage uniqueness, host stop/lock/concurrent replacement tests |
| Off-VM backups: live WAL; required backup failure | Cloud-data WAL backup leaves active drill untouched; manifest/checksum/receipt tests; host failure/last-success tests; actual runtime-identity permission probe uploaded successfully; actual SQLite/manifest upload pending |
| Release recovery: compatible/incompatible prior image | Host rollback, schema refusal, failed recovery and no-prior-image tests; direct schema helper rejects newer database without migration |
| Explicit restoration: selected/invalid backup | Real isolated-volume restore, checksum corruption rejection, host pre-validation and SQLite/WAL/SHM preservation tests; isolated restore of actual GCS backup pending |

Main has consolidated and archived its earlier text, plots, stage and voice changes. This deployment change now includes a `local-runtime` disclosure delta against those canonical specs, while preserving local defaults and archived history. Main's plot authoring remains a trusted shared workspace. Recheck integration if main advances again before merge.

## Pending live acceptance — task 6.5

Infrastructure, approved identities, versioned secrets and GitHub production variables are ready. [PR #1](https://github.com/KalacoolStudio/roleCast/pull/1) contains the implementation; merging it is the next production-changing action and will trigger the first current-main deployment.

1. Merge the reviewed deployment change, then record the main run URL, commit, tested image ID, published digest and `host.sh status`. Retry only at current main if necessary.
2. Verify frontend, `/api/health`, `/api/runtime`, plot authoring and one deliberate model exercise through an authorized app-only identity; verify the voice route and configured provider behavior without treating fixture audio as a real-device check. Verify this identity cannot SSH and an ungranted identity cannot tunnel. Recheck public-port rejection with the real application running.
3. Verify required validation failure blocks deployment and incorrect OIDC claims cannot impersonate the deployment identity. Exercise overlapping updates and a failed candidate in an isolated rehearsal environment, recording distinct failed/rolled-back/skipped outcomes.
4. Retain a test record across a release and VM reboot; confirm an active drill becomes interrupted without losing accepted messages. Record the retained disk identity. The completed bootstrap reboot checked filesystem persistence only.
5. Run a live database backup, verify private GCS database/manifest objects and status freshness, download with a restore-operator identity, and restore to a separate disposable destination. Confirm plots, drill history and checksum/schema without replacing production data.

Keep task 6.5 unchecked until these live observations are recorded. Successful bootstrap, model connectivity and automated tests are not proof that the main GitHub OIDC/deployment path or production database lifecycle has succeeded.
