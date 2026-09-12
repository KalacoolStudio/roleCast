# Validation evidence

Validated on 2026-09-12 in the isolated `roleCast-task-2` worktree on `gcp-ci-deploy`. [PR #1](https://github.com/KalacoolStudio/roleCast/pull/1) and the cloud voice-disclosure fix in [PR #3](https://github.com/KalacoolStudio/roleCast/pull/3) are merged. Automatic main deployments, private application access, persistent SQLite data, backup restoration and release recovery passed live acceptance. Task **6.5 is complete**. Observations below identify the tested commits; subsequent documentation releases do not change those historical identities.

## Integration and versions

Integrated GitHub main `8a66cfed48d45722eed1cdae3b6874fa35d68214`, including customizable plots/drills, refreshed stage artwork, GPT Live voice and the consolidated canonical specs. Resolved configuration, API, frontend, storage and browser-fixture conflicts while preserving the existing features and cloud metadata/disclosures. Also integrated main `3435adad219972f1c2972803853eea849fd73b36`, including its voice-only UI, resilient microphone processing and persona-specific voice. The storage schema is **4**; the backup compatibility helper imports the storage schema constant. The concurrent worktree continues independently; no uncommitted files or processes were imported from it.

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

Actions are pinned by full commit SHA. Terraform and actionlint release downloads were checksum verified. The final local production image ID is `sha256:f87baf300ff5c9bd74a1143d8756d09b3a30efd3e6cfa1e9aab4a8b06239df37`. This is a local image ID, **not a published Artifact Registry manifest digest**. Published manifest digests and corresponding container image IDs are recorded in the live acceptance section below.

## Executed checks

| Check | Result |
| --- | --- |
| Locked dependency install and native SQLite loading | Passed locally and during clean container builds |
| `npm run check` | Passed ESLint and Prettier |
| `npm run build` | Passed; integrated plot editor and frontend assets built |
| `npm run test:unit` | **222 tests passed**, 18 files, for the deployment integration; latest main CI passed **223 tests**, 18 files |
| `ROLECAST_TEST_PORT=3312 npm run test:e2e` | **19 tests passed** for the deployment integration; latest main CI passed **20 tests**, including voice-only controls, recovery/evidence and cloud disclosures |
| `node scripts/gcp/build-image.js rolecast:gcp-ci-deploy` | Passed; disposable nested env sentinel and local env/data excluded |
| `node scripts/gcp/container-smoke.js rolecast:gcp-ci-deploy` | Passed with networking disabled and disposable data/restore volumes |
| Docker image artifact round trip | Save/load preserves the exact tested image ID |
| Terraform format, backend-free init/validate | Passed with pinned provider lockfile |
| `terraform test` | **4 mock-provider tests passed** |
| actionlint with ShellCheck 0.11.0 and `bash -n` | Passed workflow and shell checks |
| GitHub validation and deployment | Both validation jobs and deployment passed at main `3435ada`: [run 34678606379](https://github.com/KalacoolStudio/roleCast/actions/runs/34678606379); disclosure PR CI also passed [run 34678213421](https://github.com/KalacoolStudio/roleCast/actions/runs/34678213421) |
| `git diff --check` and merge-conflict inspection | Passed |
| `openspec validate add-gcp-ci-deploy --strict` | Passed |

The integrated runtime maps the existing `rolecast-llm-api-key` secret to main's shared `API_KEY`, preserving the three approved secret payloads and resource names. The approved text endpoint is OpenAI and this value matches the pre-existing shared key. A configuration-boundary test verifies the fetched env file enables both text and voice configuration; the production container also checks public voice capability without contacting a model provider. Live model and voice-provider acceptance is described below; synthetic PCM does not establish microphone or audible playback quality.

Voice origin validation now accepts same-host loopback HTTP from the IAP forwarding port, which differs from the backend port. Regression tests exercise the real reservation and WebSocket/PCM path with controlled voice clients, reject unrelated origins, and reject spoofed `X-Forwarded-Host`. Existing HTTPS tunnel behavior remains covered.

The container smoke verifies production frontend/API serving, UID 1000, read-only container root, missing-volume rejection, root-run compatibility checks followed by a non-root restart, accepted asynchronous work, interrupted-drill recovery with accepted messages, online backup verification, and restoration to a second disposable volume. It calls no production model provider.

Host tests use real temporary files and `flock`, with Docker/systemd/block-device/cloud adapters. They verify ordering and state transitions, not a running COS VM. They cover pull/secret/mount preflight failures, required-backup and upload failure, stop failure, successful replacement, first-deploy failure, healthy/failed/incompatible rollback, stale/idempotent requests, monotonic generations across rollback, concurrent submissions, reboot transaction recovery, explicit-only blank-disk initialization, wrong-device/signature rejection, restore validation, preservation of SQLite/WAL/SHM, interrupted restore refusal, and preservation of the last successful backup timestamp after a later failure.

COS `/var` is non-executable, so generated units, transient operations and operator commands invoke host scripts using `/bin/bash`. Registry authentication uses the preinstalled `docker-credential-gcr` with a writable Docker config under `/run`. These choices were checked against the [COS filesystem documentation](https://docs.cloud.google.com/container-optimized-os/docs/concepts/disks-and-filesystem) and [container runtime guidance](https://docs.cloud.google.com/container-optimized-os/docs/how-to/run-container-instance).

## Applied GCP bootstrap and live preflight

Project `project-783f506d-73dd-47d4-96d` (number `409197180949`) is active and billing enabled. The user approved `drain.cy.chang@gmail.com` for both application and administrator access and explicitly approved reusing only the three existing LLM settings. GitHub CLI is authenticated as `Drainet`, with ADMIN access to `KalacoolStudio/roleCast`; the stable repository ID is `1366870434` and organization owner ID is `6670851`.

Created the private Terraform state bucket `gs://project-783f506d-73dd-47d4-96d-rolecast-tfstate` in `asia-east1`, with uniform bucket IAM, enforced public-access prevention and versioning. The actual checkout uses its `rolecast/production` GCS backend. A fresh reviewed plan and apply completed with **41 added, 0 changed, 0 destroyed**. Runtime secret payloads are not Terraform resources. Terraform used a short-lived OAuth token from the existing gcloud login only in its process environment; no token was printed, persisted or placed in backend configuration.

The resulting VM is `rolecast` in `asia-east1-b`, with COS image `cos-stable-121-18867-584-7`. The dedicated `rolecast-data` disk initialized successfully as ext4, label `rolecast-data`, UUID `e6f3dac6-28f2-4ccf-8ef9-98f2f6dbe194`. The app directory is UID/GID `1000:1000`, mode 0700; state and backup directories are root-owned, mode 0700. After initial preparation, `initialize_data_disk` was set to **false**. A second reviewed apply changed only VM startup metadata (**0 added, 1 changed, 0 destroyed**). The final real Terraform plan returned **no changes** after reboot.

A controlled reboot loaded the disabled initialization setting and retained the same disk UUID and a disposable persistence marker. The kernel device name changed from `/dev/sdb` to `/dev/sda`; the stable `/dev/disk/by-id/google-rolecast-data` lookup and mount verification succeeded. The marker was then removed. Disk preparation and the daily backup timer are active. At this bootstrap stage the app reported `Awaiting first deployment`. The later releases created the production schema-4 SQLite database; actual record persistence was checked separately below.

The three approved values were written directly to Secret Manager through stdin and verified byte-for-byte without displaying them. All pinned references use version **1**:

- `rolecast-llm-api-key/versions/1`
- `rolecast-llm-base-url/versions/1`
- `rolecast-llm-model/versions/1`

An isolated container on the VM verified metadata identity, all three secret reads and value formats, the preinstalled Artifact Registry credential helper, repository read permission, and upload of a non-secret permission probe into the private backup bucket. The upload receipt's size and MD5 matched. The probe object is `backups/preflight/59c6b740-81e9-4276-a8d7-f5a72570c737.json` and follows the bucket's 30-day expiry; it contains no application data or credentials. Secret access still worked after reboot. One tiny authenticated Chat Completions request to the configured model provider succeeded from the VM without recording provider credentials or response text.

A disposable credential-free HTTP listener on port 8080 verified successful access through the approved user's IAP tunnel and blocked direct public access while the listener was healthy. The listener and local tunnel were removed. This initial probe established the network path. The later real-application and restricted-identity acceptance checks below independently cover application health, app-only access and ungranted identity denial.

The GitHub `production` environment permits only the `main` branch, has no required deployment reviewers, and contains all seven non-secret variables. Every value was compared against the **applied** Terraform outputs and matched. WIF is provisioned with the repository ID, organization ID, main ref and deployment workflow restriction. Actual main-branch GitHub OIDC exchange and registry publication succeeded; a feature-branch token was rejected by the provider attribute condition in the negative acceptance check below. Existing main branch protection/rulesets were inspected and are absent; the deployment workflow's own validation gates still run for main pushes. The guide explains protection if the team wants to enforce PR-only changes.

Bootstrap and acceptance logs, receipts and screenshots are retained under the ignored local `.tmp/` directory. Only the non-secret observations needed to reproduce or audit acceptance are recorded here.

## Live application and deployment acceptance — task 6.5

The first production release passed [run 34677709801](https://github.com/KalacoolStudio/roleCast/actions/runs/34677709801), including reusable validation, offline container smoke, GitHub OIDC, image publication, IAP SSH and VM health verification. The disclosure fix also deployed successfully in [run 34678446196](https://github.com/KalacoolStudio/roleCast/actions/runs/34678446196). The teammate's subsequent main commit deployed automatically in [run 34678606379](https://github.com/KalacoolStudio/roleCast/actions/runs/34678606379).

| Observed release | Commit | Published manifest digest | Running container image ID |
| --- | --- | --- | --- |
| First release | `805b0b4c2c811fb4e85ffae8e2a6353e2d77783b` | `sha256:d961c0c991e206fdfffcb09576ab201039e97c7d53bfd2f19737f139abc3e995` | `sha256:07828ed7adc57fcac19a475c61f688583e6179651f5477d25a38585907392487` |
| Latest acceptance observation | `3435adad219972f1c2972803853eea849fd73b36` | `sha256:60cdf04270b10712eadef3ddf6865204eed648e2fcf938284caae347f93fd9dd` | `sha256:86beba679d61b8e2938614d004e33ef7dea19fdd58d9f2c57a6dbcc40f7a8a74` |

Both manifest digests belong to `asia-east1-docker.pkg.dev/project-783f506d-73dd-47d4-96d/rolecast/rolecast`. Host status reported `ROLECAST_RESULT=deployed`; the later release ID was `4-3435adad219972f1c2972803853eea849fd73b36-767006c05f9a`. The workflow tests the image before artifact transfer/publication and verifies its image ID on the VM.

Through the approved operator's IAP tunnel at `http://127.0.0.1:18080`, `/api/health` returned `{"status":"ok"}` and `/api/runtime` returned `{"deploymentMode":"gcp"}`. A real Chromium browser rendered the stage, shared-cloud disclosure, accepted message and completed report. The published frontend includes the corrected GCP/shared transcript notice; its active voice-panel rendering is covered by browser CI. The runtime env file is root-owned mode 0600, the app data directory is UID/GID 1000:1000 mode 0700, and the application service and daily backup timer are active. With the real app healthy through IAP, a direct TCP connection to the VM's public port 8080 timed out.

Created only clearly marked synthetic acceptance records: plot `9f1f6f31-845e-4670-8014-777d04147d91` (`GCP 部署驗證 · 2026-09-12`), completed drill `094e8869-0239-47e7-b088-a194469fc3fd` and interruption drill `ba88ef5f-214a-4653-bbf8-7bd89b69ee9c`. Real provider planning, Persona opening and final evaluation/report generation succeeded. A real voice reservation and WebSocket connected through IAP to the configured `gpt-live-1` provider, received `ready`, accepted a 960-byte synthetic silence PCM frame, and stopped normally. This verifies provider connection and the media route; it is **not a real microphone, speech-recognition or audible playback quality test**. These observations preceded main's later voice-only UI update; that update passed its own complete CI and deployed successfully.

### Restricted access and validation gates

A temporary keyless service account with only instance-discovery permission could read the instance metadata but could not open IAP tunnels to either 22 or 8080 (`4033`). After granting only the existing instance-specific `destination.port == 8080` IAP permission, it fetched the real app's health endpoint successfully and still could not tunnel to port 22. Impersonation tokens remained in memory. The temporary grant, discovery binding and service account were removed afterward.

A temporary feature branch ran [negative acceptance run 34678020067](https://github.com/KalacoolStudio/roleCast/actions/runs/34678020067). An actual GitHub OIDC exchange was rejected with `rejected by the attribute condition`; the assertion job passed. A deliberately invalid validation fixture failed `npm run check`, and the dependent deployment sentinel job was skipped. The run's overall **failure is the expected negative-test outcome**, not a failed production release. The sentinel had no deployment commands. The temporary remote branch was deleted; this probe never changed main or obtained deployment credentials.

### Persistence across reboot and releases

Accepted message `17170e79-7d21-42d7-b84e-fdfa3e873645` was confirmed in the active interruption drill before stopping the app and rebooting the VM. Boot ID changed from `048f64ef-160b-4d1f-bb5d-97f714627ec1` to `164b7154-ba6b-4104-bfb4-60ee614d4246`. The retained disk UUID remained `e6f3dac6-28f2-4ccf-8ef9-98f2f6dbe194` and blank-disk initialization remained disabled.

After reboot and again after the later main releases, the API retained the custom plot, marked the formerly active drill `interrupted`, and returned the same accepted message ID and text. The earlier completed drill remained `completed`, with message `c9d9fa9c-bcd4-40c2-9d9a-986ae547f34b` and its generated report intact. The final browser check rendered that saved message and report from production.

### Actual backup and isolated restoration

An online `host.sh backup` completed while the first acceptance drill was active; that drill subsequently completed normally. The runtime identity uploaded the database and manifest to the private bucket:

`gs://project-783f506d-73dd-47d4-96d-rolecast-backups/backups/scheduled/20260912T062621Z-29fdc9c4-df5a-4de0-abd9-20e58c73c8bd.sqlite`

The manifest is the same object name plus `.json`. Its format is 1, schema 4, creation time `2026-09-12T06:26:21.497Z`, size 143360 bytes, SHA-256 `3b3f108bb16930cad5b5828c5512538ecef3dc68975a1ca597d5deca9db68948`, commit `805b0b4c2c811fb4e85ffae8e2a6353e2d77783b`, and image digest `sha256:d961c0c991e206fdfffcb09576ab201039e97c7d53bfd2f19737f139abc3e995`. Backup status recorded success at `06:26:23Z`.

The approved operator downloaded both objects into private staging. Checksum/schema verification passed locally and using the selected release image on the VM. That image restored the backup into a separate disposable Docker volume and started with `--network none`, fixture provider settings and a read-only container root. Its actual API returned the custom plot, recovered drill and accepted message; direct SQLite checks returned schema 4 and `integrity_check = ok`, including `voice_attempts` and `voice_fragments`. Recovery correctly marked the backup's in-flight drill interrupted. The production database was never mounted into the restore container, and the production service remained active throughout.

Verification used writable private staging as documented: a WAL-mode SQLite backup can need temporary `-wal`/`-shm` sidecars even for read-only database access. An initial read-only staging attempt was corrected; the restored data passed all assertions. The container, volume, staging files and verification sidecars were subsequently removed and their absence checked.

The later automatic deployment also completed its mandatory pre-release backup at `2026-09-12T06:41:39Z`, object `backups/pre-release/20260912T064137Z-204136e2-004a-4853-9623-139b9cecd0c6.sqlite` in the same private bucket. Both latest-attempt and last-success status agreed. The daily timer's next scheduled run was `2026-09-13 03:00:00 UTC`; this acceptance directly executed the same backup command instead of claiming an unobserved future timer run.

### Isolated release recovery and cleanup

A disposable 64 MiB ext4 loop disk, separate systemd service/container, separate release state and loopback port 18081 exercised the installed production controller on the actual COS VM. Wrappers changed only resource names, paths, health port and rehearsal backup prefix. Production service and data paths were not targeted. The temporary unit was enabled like the production unit so systemd retained its inactive definition between operations.

The first candidate became healthy and an isolated sentinel plot was created. A deliberately unhealthy candidate used the published image with a wrong application port. A healthy request queued concurrently. Assertions passed: the bad candidate exited nonzero with `ROLECAST_RESULT=rolled-back`; the queued request completed with `ROLECAST_RESULT=already-current`; generation watermark advanced to 3; an older generation returned `ROLECAST_RESULT=skipped-stale`; and the sentinel plot survived. The real backup uploader succeeded under `backups/rehearsal-20260912/pre-release/`, separate from production backup prefixes.

The temporary service, container, loop device, disk and runtime/state directories were removed. Restore resources, the temporary IAP identity and the temporary GitHub branch were also removed. Synthetic acceptance records remain clearly marked in the shared app, and the isolated rehearsal backup objects expire under the configured 30-day bucket policy. After cleanup, the application and backup timer were active and a real Terraform plan returned **exit 0, no changes**. The other worktree's files, branch and processes were untouched.

## Spec scenario coverage

| Requirement and scenarios | Evidence |
| --- | --- |
| Complete runtime; another drill active | Real frontend/API/model exercise; container asynchronous-work smoke and engine/API conflict tests |
| Authorized/unauthorized private access and unrelated Origin | Actual app-only 8080 success, SSH denial, ungranted IAP denial, public-port rejection; API/WebSocket Origin regression tests |
| Explicit cloud configuration and missing volume | Cloud-runtime tests, production container startup, missing-mount smoke, actual retained disk and host mount/device tests |
| Secret isolation and denied secret | Build sentinel, metadata/denied-fetch tests, actual runtime identity reads, private env file and provider connectivity |
| Accurate cloud notice and local compatibility | Cloud/local browser coverage and published cloud disclosure; configuration precedence/defaults; isolated test ports |
| Main automation, unmerged work and retry | Three successful main deployments, actual feature OIDC rejection, workflow trigger/ref/event guards and current-main checks |
| Validation gates and tested image identity | Actual failed validation with skipped dependent job; artifact save/load, published digest and VM image verification |
| Scoped trusted/untrusted identity | Actual trusted main exchange and feature attribute-condition rejection; Terraform claim assertions |
| Bootstrap and incomplete configuration | Actual infrastructure apply and first release; configuration failure tests and complete operator guide |
| Serialized releases and healthy/unhealthy outcomes | Real COS isolated rollback/concurrency/stale-generation rehearsal plus host lock/recovery tests |
| Persistent records and single writer | Actual accepted-message retention and active-drill interruption across reboot/releases; retained disk, container replacement and writer-lock tests |
| Off-VM backups and required-backup failure | Actual online SQLite/GCS backup and later required pre-release backup; WAL, upload-failure and last-success preservation tests |
| Compatible/incompatible release recovery | Actual isolated failed-candidate rollback; host schema refusal, failed recovery and missing-prior-image tests |
| Explicit selected/invalid restoration | Actual private GCS backup restored to isolated volume; checksum corruption rejection and host SQLite/WAL/SHM preservation tests |

Main has consolidated its earlier text, plots, stage and voice changes. This deployment change retains its `local-runtime` disclosure delta against those canonical specs while preserving local defaults and archived history. All implementation and live acceptance tasks are complete; the change remains available for the normal OpenSpec archive workflow.

## Workspace integration note — 2026-09-12

The `style` merge of current main reconciles this active change's global/shared-workspace wording with main's browser-scoped histories, per-workspace active limit, and schema 5 migration. The local-runtime disclosure delta is synchronized; the three new cloud capability deltas remain active. Original cloud acceptance above remains historical evidence. This documentation reconciliation did not deploy or change cloud resources; combined local tests are recorded in [the introduction change](../add-anti-fraud-chat-intro/validation.md#main-integration--2026-09-12).
