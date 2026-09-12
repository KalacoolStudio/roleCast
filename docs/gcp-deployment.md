# Deploy Role Cast to GCP

Merging a pull request into `main` runs validation, builds and tests one Docker image, publishes that image to Artifact Registry, and replaces the running release by digest. The image serves the React frontend and Fastify API together. SQLite lives on a separate retained disk; daily and pre-release backups go to a private Cloud Storage bucket.

This is one shared workspace with one active drill. Everyone granted application access can read its history and edit plots. A release or reboot interrupts an active drill and retains accepted messages; it does not resume model work. The interface discloses GCP storage and sharing. Inference content still goes to the configured external model provider.

The default region is Taiwan, `asia-east1`, zone `asia-east1-b`. Application access uses a Google-authenticated IAP tunnel and a loopback browser URL. This configuration does not provide a public website or per-user accounts.

## Prerequisites and resource inventory

Use an existing billed project and an operator identity allowed to enable APIs, manage the project's compute/network/storage resources, service accounts and IAM policies. Install Google Cloud CLI, Terraform **1.14.9**, GitHub CLI, and Docker for local container checks. Terraform pins Google provider **7.43.0** in its lockfile. Authentication uses Google identities and GitHub Workload Identity Federation; no service-account key is needed.

| Resource          | Default and purpose                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Compute Engine    | One `e2-small` COS VM, 20 GB boot disk, external IPv4 for outbound requests                          |
| SQLite storage    | Separate 10 GB `pd-balanced` disk, filesystem label `rolecast-data`, deletion protected in Terraform |
| Network           | Dedicated VPC/subnet; ingress only from IAP's `35.235.240.0/20` to ports 8080 and 22                 |
| Artifact Registry | Private Docker repository, immutable tags, digest-based releases                                     |
| Secret Manager    | Three secret containers, explicitly pinned numeric versions                                          |
| Backups           | Private regional bucket; objects expire after 30 days by default                                     |
| Terraform state   | Separate private, versioned bucket created during bootstrap                                          |
| Identity          | Separate runtime/deployment service accounts; app-only and SSH operator grants                       |

VM uptime, both disks, external IPv4, registry storage, backups/state, requests, egress and model usage can incur charges. This is not a free-tier guarantee. Review the [GCP pricing calculator](https://cloud.google.com/products/calculator) for your region and set a billing budget. Images are retained for rollback; review registry growth and retain every digest referenced by a current/previous release or a required backup. Backup lifecycle expiry is asynchronous. Local failed backups and pre-restore copies also consume disk until an operator removes them after verification.

## Bootstrap infrastructure

Run from the repository root, using a checkout containing this change. Terraform bootstrap is an operator step; the application workflow does not grant itself infrastructure-management privileges.

```bash
export ROLECAST_PROJECT=project-783f506d-73dd-47d4-96d
export ROLECAST_REGION=asia-east1
export ROLECAST_ZONE=asia-east1-b
export ROLECAST_STATE_BUCKET="${ROLECAST_PROJECT}-rolecast-tfstate"
gcloud auth login
gcloud auth application-default login
gcloud projects describe "$ROLECAST_PROJECT"
gcloud billing projects describe "$ROLECAST_PROJECT"
gh auth login
gh api repos/KalacoolStudio/roleCast --jq '{repository_id: .id, owner_id: .owner.id}'
```

RoleCast's repository ID is `1366870434` and owner ID is `6670851` (verified 2026-09-12). Recheck these when using a fork or transferred repository. The WIF policy also restricts the repository path, `main`, the deployment workflow path, and push/manual events.

Create state storage once, without opening it to public access:

```bash
gcloud storage buckets create "gs://$ROLECAST_STATE_BUCKET" \
  --project="$ROLECAST_PROJECT" --location="$ROLECAST_REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$ROLECAST_STATE_BUCKET" --versioning
```

Keep bucket access limited to infrastructure operators. GitHub's deploy identity does not receive state access. If a managed state bucket already exists, use its name instead of creating another.

Copy `infra/gcp/terraform.tfvars.example` to `infra/gcp/terraform.tfvars` only if the latter does not exist. This local file is Git-ignored. Set the project, repository IDs, and explicit `user:email` or `group:email` identities. `application_users` get IAP port 8080; `administrators` get IAP port 22, OS Admin Login and backup reading. Add an administrator to both lists if they should also browse the app. Never put credentials or secret payloads in tfvars.

For the new blank disk, set `initialize_data_disk = true`. Review and apply:

```bash
terraform -chdir=infra/gcp init \
  -backend-config="bucket=$ROLECAST_STATE_BUCKET" \
  -backend-config="prefix=rolecast/production"
terraform -chdir=infra/gcp plan -out=bootstrap.tfplan
terraform -chdir=infra/gcp apply bootstrap.tfplan
terraform -chdir=infra/gcp output
```

The first boot formats only the expected blank disk with explicit initialization enabled. An existing filesystem, unexpected signature, missing device or unreadable previously initialized device fails closed. Check `rolecast-prepare.service` over the administrator SSH command from Terraform output. Before any image is deployed, the application reports `Awaiting first deployment.`

After successful disk preparation, set `initialize_data_disk = false`, review a new plan, and apply again. Restart the VM to load the updated startup configuration. The retained data disk stays attached. This prevents an unintended future bootstrap from initializing a replacement blank disk without operator action.

Startup scripts recreate systemd units on every COS boot. Systemd and operator commands invoke the host script through `/bin/bash` because [COS mounts `/var` with noexec](https://docs.cloud.google.com/container-optimized-os/docs/concepts/disks-and-filesystem). Changes to Terraform-managed host scripts, systemd units or secret-version references require an operator Terraform apply and VM restart. Routine application releases do not run Terraform. Review changing COS image-family results during later plans; VM replacement is an explicit maintenance operation, described below.

## Enter production model settings

Terraform creates secret containers only. Add each value directly to Secret Manager as the bootstrap operator. Use production-specific values, independently chosen from the developer `.env`; no workflow uploads local secrets or databases.

The commands below run in Bash. They read values without echoing them or placing them in command arguments/history:

```bash
for ROLECAST_SECRET in rolecast-llm-api-key rolecast-llm-base-url rolecast-llm-model; do
  printf 'Value for %s: ' "$ROLECAST_SECRET"
  IFS= read -r -s ROLECAST_VALUE
  printf '\n'
  printf '%s' "$ROLECAST_VALUE" | gcloud secrets versions add "$ROLECAST_SECRET" \
    --project="$ROLECAST_PROJECT" --data-file=-
  unset ROLECAST_VALUE
done
```

The base URL is an OpenAI-compatible Chat Completions API base, usually ending in `/v1`, without `/chat/completions`. Values must be single-line. Record each numeric version returned and set `secret_versions` accordingly; defaults are all `"1"`. If references change, apply Terraform and restart the VM before the next release. Never use the mutable `latest` alias. Keep prior versions enabled while their releases may be rolled back to.

The `rolecast-llm-api-key` secret supplies the application's shared `API_KEY` for text and GPT Live voice. The deployed voice client uses the default OpenAI endpoint and voice from current main; use a key with the required OpenAI access. The secret resource name remains stable for existing installations.

Each app start fetches the release's pinned versions through VM identity into `/run/rolecast/runtime.env`, mode 0600. That volatile file is removed on service stop. Credential contents are excluded from application logs, frontend assets, GitHub artifacts and Terraform state. Trusted VM administrators can access runtime credentials and are therefore privileged users.

## Configure GitHub and deploy

In the repository's **Settings → Environments**, create `production`. Restrict deployment branches to `main`. Leave required reviewers disabled if merges should deploy automatically; adding reviewers intentionally makes deployment wait for approval.

Run `terraform -chdir=infra/gcp output -json github_variables` and create these **environment variables**, using the exact output values:

| Variable                         | Source                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`                 | Existing billed project                                                              |
| `GCP_REGION`                     | Registry region                                                                      |
| `GCP_ZONE`                       | VM zone                                                                              |
| `GCP_INSTANCE`                   | VM name                                                                              |
| `GCP_REPOSITORY`                 | Artifact Registry repository ID                                                      |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/NUMBER/locations/global/workloadIdentityPools/.../providers/...` name |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | Deploy service-account email                                                         |

These are configuration variables, not model secrets. Enable GitHub Actions and protect `main` with pull-request review and the `application` and `infrastructure` CI checks. Confirm their names in the first PR's check list. The main push trigger also runs after a direct push, so branch protection enforces the intended merge-only process.

Merge this change only after infrastructure, secret versions and the production environment are ready. `Deploy GCP` calls the same CI validation used for PRs. It publishes the **already tested** image artifact under a unique immutable tag, resolves the digest, and invokes the host controller through IAP SSH. PR validation has no OIDC write permission or production environment.

The deploy job is serialized with `cancel-in-progress: false`. It checks current main before authentication and again before replacement. A durable host generation watermark rejects older queued runs, including after manual image rollback. Identical healthy releases are idempotent. An SSH disconnect does not cancel a release already submitted to systemd.

After a failure, inspect the workflow summary and host state. Retry the workflow on the **current main head**, rather than rebuilding an older commit:

```bash
gh workflow run deploy-gcp.yml --repo KalacoolStudio/roleCast --ref main
```

The summary distinguishes requested commit/image, operation outcome, actual current release and latest backup status. A failed candidate remains a failed workflow even when the previous image successfully recovers.

## Private browser access and health

An application user authenticates with their own Google account and runs the `application_tunnel` output:

```bash
gcloud compute start-iap-tunnel rolecast 8080 \
  --project="$ROLECAST_PROJECT" --zone="$ROLECAST_ZONE" \
  --local-host-port=127.0.0.1:18080
```

Keep the tunnel open and browse `http://127.0.0.1:18080`. `GET /api/health` checks database connectivity; `/api/runtime` returns only the deployment mode. App users do not need SSH privileges. Direct public access to the VM's application port is blocked. Project owners or identities with inherited broader IAM grants may have additional access; use a genuinely ungranted identity for denied-access verification.

Administrators connect using:

```bash
gcloud compute ssh rolecast --project="$ROLECAST_PROJECT" \
  --zone="$ROLECAST_ZONE" --tunnel-through-iap
sudo /bin/bash /var/lib/rolecast/host.sh status
sudo systemctl status rolecast.service rolecast-backup.timer
sudo journalctl -u rolecast.service -u rolecast-backup.service --since today
```

Health checks validate both the API and built frontend. Real model quality and provider credentials also need one deliberate application exercise after bootstrap.

## Backups and rollback

The backup timer runs at **03:00 UTC** daily and catches up after reboot. It uses SQLite's online backup API without instantiating the engine or recovering an active drill. The output includes committed WAL data, an integrity check and a JSON manifest with schema, timestamp, commit, image, byte count and SHA-256. Uploads use unique objects, refuse overwrite and check the Cloud Storage receipt. Both the database and manifest must upload before success is recorded.

Run a backup and inspect its age:

```bash
sudo /bin/bash /var/lib/rolecast/host.sh backup
sudo /bin/bash /var/lib/rolecast/host.sh status
sudo systemctl list-timers rolecast-backup.timer
```

`status` prints the UTC time and `OK` or `FAILED` plus object name. An absent/stale timestamp requires investigation; there is no external alert subscription in this setup. Operators can list the bucket from their workstation with `gcloud storage ls --long gs://BUCKET/backups/**`. Inspect failures in the backup journal, IAM grants, free disk space and outbound connectivity. Failed local backups remain under `/mnt/disks/rolecast/backups`; remove them only after a replacement has been verified.

Replacement preflights registry and secrets while the old release runs, stops its writer, requires a successful pre-release backup, then starts and verifies the candidate. Compatible image rollback uses the **current database**. It never automatically restores a backup or discards newly accepted data.

To request the previous compatible image manually:

```bash
sudo /bin/bash /var/lib/rolecast/host.sh rollback
sudo /bin/bash /var/lib/rolecast/host.sh status
```

Schema compatibility is read directly without running migrations or engine recovery. The integrated plot editor, live drill stage and voice evidence use schema **4**. Future migrations must update the storage schema constant; the image helper imports it. An older incompatible image is refused, leaving data and transaction evidence intact. Use a corrected forward release, or deliberately select a matching backup and image for restoration. A reboot during a release returns to the last verified compatible release; an interrupted data restore requires operator review before any application starts.

## Explicit data restore

First download the selected `.sqlite` object **and its `.sqlite.json` manifest** with an operator identity. The VM runtime identity can create backup objects but cannot read them back. Use a private local staging directory and verify the backup with the selected release image before production replacement:

```bash
mkdir -m 700 /tmp/rolecast-restore
gcloud storage cp gs://BUCKET/backups/scheduled/OBJECT.sqlite /tmp/rolecast-restore/selected.sqlite
gcloud storage cp gs://BUCKET/backups/scheduled/OBJECT.sqlite.json /tmp/rolecast-restore/selected.sqlite.json
docker run --rm --network none --user 0 \
  --mount type=bind,src=/tmp/rolecast-restore,dst=/backups \
  --entrypoint node IMAGE_AT_DIGEST scripts/gcp/database.js verify /backups/selected.sqlite
```

Authenticate Docker to the registry and pull that digest first if needed. To rehearse restoration, copy the verified backup to a new disposable Docker volume, give its directory/database UID 1000 ownership, and start the image against that volume with fixture configuration and networking disabled. Check retained plots and drill history through `docker exec` and its loopback API. Never mount the live production disk into the rehearsal. `scripts/gcp/container-smoke.js` provides an automated fixture example of this procedure.

Restoring makes the selected backup timestamp the live recovery point. Records accepted afterward disappear from the restored live history and remain available only in the preserved pre-restore files or other backups.

For production replacement, take a fresh backup, record `host.sh status`, and select a known release ID under `/mnt/disks/rolecast/state/releases` whose image supports the backup schema. Transfer the two staged files to the administrator's home directory:

```bash
gcloud compute scp /tmp/rolecast-restore/selected.sqlite /tmp/rolecast-restore/selected.sqlite.json \
  rolecast: --project="$ROLECAST_PROJECT" --zone="$ROLECAST_ZONE" --tunnel-through-iap
gcloud compute ssh rolecast --project="$ROLECAST_PROJECT" --zone="$ROLECAST_ZONE" --tunnel-through-iap
sudo install -m 600 selected.sqlite selected.sqlite.json /mnt/disks/rolecast/backups/
sudo /bin/bash /var/lib/rolecast/host.sh restore selected.sqlite RELEASE_ID --replace-current-data
sudo /bin/bash /var/lib/rolecast/host.sh status
```

The explicit restore validates the manifest, integrity and schema before stopping the writer. It preserves the current SQLite file and any WAL/SHM sidecars together in a timestamped `state/pre-restore-*` directory, installs the selected backup, and checks the application. Failed or interrupted restoration stays stopped and retains both sources. Inspect the transaction and preserved directory, then retry with a verified backup and compatible release; never delete the transaction marker to force an empty startup. Keep the preserved files until the restored records have been reviewed.

## VM replacement and capacity

For VM maintenance, stop the application, verify a recent successful backup, and record current/previous release IDs. Keep `initialize_data_disk = false`. The application disk is a separate Terraform resource with `prevent_destroy`; VM deletion protection also requires a deliberate override.

If replacement is necessary, an infrastructure operator can disable VM deletion protection, remove **only the VM while retaining its disks**, and review a Terraform plan that recreates the VM while reattaching the existing `rolecast-data` disk. Do not accept a plan that replaces that disk or the backup bucket. New startup metadata reinstalls host units, mounts the retained disk, and starts the last verified release. Verify records and private access after replacement. This has downtime; it is not a multi-instance system.

Monitor disk capacity and memory as history grows. Backup helpers read a complete backup into memory for hashing/upload, so size the VM for both runtime and backup use. There is no autoscaling or automatic database pruning.

## Local verification and container use

Local development still uses `.env`, loopback binding and local SQLite. The container defaults require explicit model settings and a mounted `/data` directory in GCP mode. For a local trial, use a dedicated env file with `HOST=0.0.0.0`, `PORT=8080`, `DEPLOYMENT_MODE=gcp`, `DATABASE_PATH=/data/role-cast.sqlite` and your chosen model settings. Keep it outside the image and mode 0600.

```bash
node scripts/gcp/build-image.js rolecast:local
docker volume create rolecast-local-data
docker run --rm --user 0 --mount type=volume,src=rolecast-local-data,dst=/data \
  rolecast:local node -e "require('fs').chownSync('/data',1000,1000)"
docker run --rm --read-only --tmpfs /tmp --init \
  --env-file /PATH/TO/PRIVATE/runtime.env --publish 127.0.0.1:8080:8080 \
  --mount type=volume,src=rolecast-local-data,dst=/data rolecast:local
```

The build helper inserts a disposable secret sentinel into the build context, checks its exclusion, and removes it. Offline container smoke uses temporary volumes and controlled agents, checks async work/restart durability, and exercises backup/isolated restore without calling a model provider.

```bash
npm ci --no-audit --no-fund
npm run check
npm run build
npm run test:unit
npx playwright install chromium
ROLECAST_TEST_PORT=3312 npm run test:e2e
node scripts/gcp/container-smoke.js rolecast:local
terraform -chdir=infra/gcp init -backend=false -lockfile=readonly
terraform -chdir=infra/gcp validate
terraform -chdir=infra/gcp test
```

Run backend-free Terraform checks in a separate clean checkout if your operator checkout already has a configured remote backend. See the OpenSpec change's [validation evidence](../openspec/changes/add-gcp-ci-deploy/validation.md) for automated coverage and the remaining live acceptance checklist.
