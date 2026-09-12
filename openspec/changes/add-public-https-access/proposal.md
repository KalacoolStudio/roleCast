## Why

RoleCast is deployed on GCP but currently requires a local IAP tunnel. Users need a stable public HTTPS address that opens directly in a browser, while the existing VM continues running asynchronous model work and retaining SQLite data.

## What Changes

- Add a Google-hosted Cloud Run HTTPS gateway that forwards frontend, API, streaming events and voice WebSockets to the existing VM over a dedicated private VPC subnet.
- Keep the VM application and SSH ports closed to direct internet ingress, and keep model credentials and database storage on the existing VM.
- Make gateway access explicit: Google IAP sign-in for configured users, or anonymous browser access when selected by the operator. The user selected anonymous access for anyone with the link on 2026-09-12.
- Preserve main's browser-workspace isolation and schema-5 migration. Verify existing data is assigned to an operator workspace before anonymous access is enabled.
- Repair deployment-test integration with workspace cookies and deterministic voice evidence, and exercise the proxy's streaming, Origin and cookie behavior.
- Document the public URL, access configuration, costs, deployment continuity and rollback of the gateway. Reconcile the earlier deployment change's private-only and shared-history wording with the optional gateway and current workspace behavior.

## Capabilities

### New Capabilities

- `gcp-public-access`: Browser HTTPS entry point, explicit gateway access policy, private upstream isolation, streaming transport and continuity across app deployments.

### Modified Capabilities

None. Existing browser-workspace isolation and local runtime requirements remain in force. The earlier unarchived `add-gcp-ci-deploy` change will be reconciled to reference the optional public gateway without replacing its historical validation evidence.

## Impact

Terraform gains Cloud Run, a gateway identity, a dedicated subnet and a narrowly scoped upstream firewall rule. A pinned NGINX image and repository-owned configuration provide the stateless proxy; no model credentials or database copies enter it. CI tests the proxy and the existing application. The main-push workflow continues deploying the same VM application, so its public URL stays stable across releases. Custom domains are optional future configuration; a Google-provided address is the default for this request.
