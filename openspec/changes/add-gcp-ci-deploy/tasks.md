## 1. Runtime configuration and frontend

- [x] 1.1 Add validated local/GCP mode, bind host, and cloud database-path configuration; verify local defaults, environment precedence, valid cloud settings, and invalid-setting failures with focused configuration tests.
- [x] 1.2 Wire cloud binding into server startup while preserving one engine and existing recovery behavior; verify frontend/API serving on the configured interface and restart interruption against a temporary database.
- [x] 1.3 Add non-secret runtime metadata and update frontend storage/sharing labels; verify both modes with API and browser assertions, including rejection of unrelated Origin headers and absence of secret configuration in responses.

## 2. Reproducible container

- [x] 2.1 Add a multistage Dockerfile with a consistent supported Node version, production dependencies, built frontend, and non-root runtime; verify a clean image build and native SQLite loading inside that image.
- [x] 2.2 Add container-context exclusions and a documented mounted-data startup command; verify a sentinel developer env value and local database are absent from image layers/assets and that the container writes only to the supplied data volume.
- [x] 2.3 Add a fixture-only container smoke helper covering frontend/API health, accepted asynchronous work, restart durability, and interrupted sessions; verify it passes with no production credentials or model-provider network access.

## 3. GCP infrastructure and access

- [x] 3.1 Add pinned Terraform/provider configuration, a lockfile, non-secret variable examples, and private remote-state bootstrap instructions; verify formatting, backend-free initialization/validation, and a variable-complete example configuration.
- [x] 3.2 Define required APIs, Artifact Registry, dedicated networking, the VM, and a separately retained data disk; verify the infrastructure plan has only IAP application/SSH ingress, outbound connectivity, disk retention, and no deprecated container startup resource path.
- [x] 3.3 Define runtime, deployment, application-user, and restore-operator permissions plus repository/owner/main/workflow-bound Workload Identity Federation; verify the generated policy distinguishes port 8080 users from SSH administrators and rejects incorrect OIDC claim combinations.
- [x] 3.4 Define private backup storage with configurable 30-day expiry and named Secret Manager resources without secret payloads; verify public-access prevention, scoped IAM, deletion protections, and absence of credentials from planned state.
- [x] 3.5 Expose all non-secret outputs required by GitHub and private browser access; verify that the first-run variable checklist maps every workflow/runtime input to an output or an explicit operator-supplied value.

## 4. Host lifecycle and database recovery

- [x] 4.1 Add startup/cloud-init and a systemd application unit that mounts the configured disk and runs one container; verify first initialization, repeated boot, missing mount, unexpected device, permissions, and refusal to reformat existing data using disposable resources.
- [x] 4.2 Add runtime identity secret retrieval and owner-restricted temporary env-file handling; verify success, denied/missing secret failures, reboot refresh, cleanup, and logs that contain no secret values.
- [x] 4.3 Implement a direct SQLite backup helper, integrity/checksum manifest, private uploader, and daily timer; verify committed WAL data survives a backup without recovering or interrupting the live exercise and that upload failures and backup age are observable.
- [x] 4.4 Implement serialized release replacement with candidate preflight/pull, writer shutdown, required backup, health checks, and atomic release metadata; verify healthy release, failed preflight, failed backup, duplicate invocation, and concurrent operation handling against isolated data.
- [x] 4.5 Add interrupted-deployment recovery and schema-aware previous-image rollback; verify lost-connection/reboot recovery, compatible rollback, unsupported schema, missing prior image, and rollback failure preserve the database and report correct failure outcomes.
- [x] 4.6 Add explicit backup restoration with staging validation and preservation of current SQLite/WAL/SHM files; verify a successful restore and rejection of an invalid backup using disposable volumes, without automatic production-data replacement.

## 5. GitHub Actions

- [x] 5.1 Add pull-request and reusable main validation with locked installation, lint/format, build, unit/integration tests, and Playwright browser setup; verify workflow syntax and run the full check sequence without production secrets.
- [x] 5.2 Add the main-push deployment workflow and guarded current-main manual retry, pinned action revisions, production-job-only OIDC permissions, and configuration preflight; verify feature/PR/incorrect-ref cases cannot enter cloud authentication or deployment.
- [x] 5.3 Build, smoke-test, publish, and deploy one immutable image artifact; verify the container tested, registry digest selected, and VM release metadata correspond to the same source commit and image.
- [x] 5.4 Add deployment concurrency, stale-candidate rejection, remote operation invocation, and meaningful workflow summaries; verify out-of-order runs cannot replace newer releases, active replacements are not cancelled, and successful/failed/rolled-back outcomes remain distinct.

## 6. Documentation and integrated validation

- [x] 6.1 Write a complete GCP deployment guide covering billed-project prerequisites, infrastructure bootstrap, secret-version entry, GitHub variables, branch protection, IAP access, costs/resource inventory, and first deployment/retry; verify commands and required values against the implemented configuration.
- [x] 6.2 Document backups, backup-age inspection, compatible image rollback, explicit data restore, VM replacement, and shared-workspace/restart limitations; verify that examples avoid developer data uploads, public ingress, and implicit data deletion.
- [x] 6.3 Update README and example configuration while retaining local commands and disclosures; verify `npm run check`, `npm run build`, unit/integration tests, and browser tests in the isolated worktree without altering the other task's files or processes.
- [x] 6.4 Run workflow lint, Terraform validation, container integration, and deployment failure/backup/restore scenarios; record results and exact tested versions in this change's validation artifact, and verify each spec scenario has test evidence or an explicit live validation step.
- [x] 6.5 In the user-configured GCP environment, verify a current-main deployment, authorized and denied private access, frontend/API health, record retention across release/reboot, and backup restoration to an isolated destination; record commit/digest and evidence, and keep this task pending if cloud setup or access is unavailable.
- [x] 6.6 Validate the finished OpenSpec change and inspect main-branch integration with the concurrent GPT Live work before merge; verify no contradictory local/cloud requirements remain in the artifacts and rerun affected checks after resolving any integration changes.
