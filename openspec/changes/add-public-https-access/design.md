## Context

See proposal.md for the requested public browser access. Main `2e67715` adds cookie-scoped browser workspaces and SQLite schema 5; its latest deployment was blocked by a voice browser-test race. Production remains on the earlier schema-4 release. The existing COS VM, database disk, Secret Manager settings, backups and main-branch deployment are already provisioned. The project has no Cloud Run service/API yet.

## Goals / Non-Goals

**Goals:** Add a stable HTTPS frontend for the existing always-running backend, preserve streaming and workspace boundaries, and make access policy an explicit infrastructure setting.

**Non-Goals:** Move SQLite to Cloud Run, introduce per-request backend execution, create a domain purchase/DNS dependency, add user-account synchronization, or replace the existing deployment and backup controller.

## Decisions

1. **Cloud Run gateway with Direct VPC egress.** A small stateless NGINX service provides the Google-hosted `run.app` URL and managed TLS, forwarding to the VM's private IP. A separate `/26` subnet and firewall rule permit only that range to reach port 8080. An external load balancer needs additional certificate/domain setup; moving the app itself to Cloud Run would require redesigning durable SQLite and background model execution.
2. **Pinned proxy and versioned configuration.** Use the official NGINX 1.30.4 Alpine image at verified manifest digest `sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c`. Terraform renders the fixed upstream into a repository template and passes non-secret configuration to the container. No model credentials, database mounts or Google API permissions are given to its dedicated service identity. Request bodies and workspace tokens are excluded from proxy logs.
3. **Access states: restricted, IAP, anonymous.** Provisioning defaults to restricted IAM invocation. IAP mode enables browser Google sign-in and grants only existing configured application users. Anonymous mode disables the invoker IAM check only when explicitly selected. The production setting is an operator input; the user selected anonymous access on 2026-09-12. Both policies use the same gateway architecture. For this project without a Google organization, first-time IAP OAuth setup may require the Cloud Console; no user OAuth secret is stored in Terraform.
4. **Preserve transport semantics.** Use HTTP/1.1 upstream, explicit WebSocket Upgrade forwarding, disabled response/request buffering, a one-hour service timeout, and upstream connect/read timeouts. Preserve browser Host and Origin; overwrite the forwarded scheme with HTTPS and remove forwarded-host claims. Secure, HttpOnly workspace cookies remain app-owned. A startup probe requests the real upstream health endpoint to accommodate Direct VPC connection initialization. Configure bounded scaling; open streams consume Cloud Run resources. Explicitly disable upstream connection caching (`keepalive 0`): ordinary requests carry `Connection: close`, while the application’s SSE responses advertise keep-alive. NGINX 1.30 enables upstream caching by default; reusing a completed SSE connection in this combination causes the next request to receive a backend HTTP-parser 400.
5. **Keep existing main deployment.** The gateway uses the VM's stable private address and requires no per-release update. CI adds a fixture-only real-container gateway smoke test. Fix the current voice test by waiting for its initial microphone transcript before injecting a later utterance and asserting the cited anchor itself. The application container smoke must retain a real workspace cookie across container restart and isolated restore instead of relying on a fixture-only auth bypass.
6. **Safe migration sequence.** Deploy passing schema-5 code through the existing main pipeline while public access remains restricted. If legacy data is unclaimed, claim it through the operator-only path and retain its cookie in a private local operator artifact before anonymous access. Verify fresh visitor workspaces cannot retrieve those IDs. Apply the user-selected access mode last, then verify the real HTTPS URL, cookies, frontend/API, streaming and public backend-port denial.

## Risks / Trade-offs

- Cloud Run cold starts can wait for Direct VPC connectivity → upstream-aware startup probe and documented option to retain a minimum instance.
- SSE/WebSockets count as active requests and can last up to the configured request timeout → bounded instances/concurrency and documented streaming cost/reconnect behavior.
- Anonymous users can spend the project's model credits → access mode is an explicit operator choice; browser isolation is not a billing quota or account login.
- Schema 5 cannot be served by a schema-4 image → retain the required pre-release backup and use a corrected schema-5 forward release if rollback compatibility rejects the older image.
- Workspace credentials are browser cookies and do not transfer automatically between hostnames/devices → preserve migrated operator data before opening the endpoint and document the browser-bound behavior.

## Migration Plan

Prepare and validate Terraform, proxy configuration, tests and operational documentation. Review an actual plan with no VM/data replacement, apply the restricted gateway, and verify its upstream using an operator identity token. Merge the passing app/test changes and complete the normal VM release. Preserve any unclaimed legacy workspace. Configure the selected public access policy, verify live acceptance, record the HTTPS URL and clean up temporary test resources. To withdraw public access, set the gateway access mode to restricted; the VM, data and IAP tunnel continue operating.

## References

- [Cloud Run Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud Run IAP and first-time OAuth setup](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
- [Cloud Run WebSocket timeouts](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [NGINX WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
