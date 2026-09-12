# Public HTTPS gateway validation

Prepared on 2026-09-12 in `roleCast-task-2`, branch `gcp-ci-deploy`, based on main `2e6771524d4f0d8d34dccdc070d9af012fd99057`. Integrated the subsequent ATM-action main commit `b915e04`; the combined version passed 229 unit tests and 22 browser tests. The other worktree and its processes remain independent. Initial provisioning used restricted operator invocation. The user subsequently selected anonymous access; final acceptance is recorded below.

## Local and CI prerequisites

| Check | Result |
| --- | --- |
| `npm run check` and build | Passed |
| Unit/integration suite | 227 passed, 19 files |
| Full browser suite on isolated port 3312 | 21 passed |
| Focused voice browser suite | 7 passed |
| Terraform validation/tests | 8 passed, including restricted, IAP and anonymous gateway policies |
| Workflow lint with actionlint/ShellCheck | Passed |
| Strict OpenSpec validation | All 12 items passed |
| Production image build and secret/data exclusion | Passed; local image `sha256:f0c69727660cc69c33e0e6c372382746c3d32cd5c3ffea90239035b771cccb6c` |
| Production container smoke | Passed with network disabled: workspace cookie, async work, restart interruption, accepted messages, backup and isolated restore |
| Real NGINX gateway container smoke | Passed in an internal Docker network: fixed upstream, Host/Origin, Secure/HttpOnly cookie, incremental SSE, bidirectional binary WebSocket, client disconnect cleanup and upstream failure |

Node/npm are 26.7.0/11.19.0, Terraform 1.14.9, Google provider 7.43.0, and NGINX 1.30.4 Alpine. The official NGINX manifest digest `sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c` was verified against the registry response bytes. The proxy template explicitly locates all temporary directories under `/tmp`; it passed with a read-only container root. Test clients and upstream run inside the internal Docker network without production credentials or provider access.

The prior main run [34679466833](https://github.com/KalacoolStudio/roleCast/actions/runs/34679466833) stopped at a browser evidence assertion. The test could inject its final utterance before the first synthetic microphone utterance, letting capture timing change the last evidence. The corrected check waits for initial capture and follows the exact cited anchor. It preserves the evidence assertion instead of weakening or skipping it. The cookie-aware container test removes the old fixture auth bypass and resumes the same stored workspace after restoring a production database.

## Live rollout

The initial reviewed plan adds six resources, changes no existing resources and destroys none. It enables Cloud Run and creates the gateway service, its service identity, dedicated `10.90.1.0/26` subnet, TCP-8080-only upstream firewall, and operator-only invocation binding. The VM and retained disk are no-op resources. All runtime model settings and backup permissions remain on the existing identities.

The restricted gateway is provisioned at `https://rolecast-gateway-pzc7so2xgq-de.a.run.app`. It uses Cloud Run gen2 with the required 512 MiB memory. Anonymous `/api/health` returned 403; approved-operator identity-token requests to `/`, `/api/health` and `/api/runtime` returned 200 with the expected frontend, healthy database and GCP mode. Tokens remained in memory. `GCP_APPLICATION_URL` is configured in GitHub production variables. The original VM, data disk and runtime credentials were not changed by this apply. Application migration completed in the release below; selected-policy acceptance was still pending at this stage. Successful local checks do not imply anonymous access or completed Google sign-in setup.

The first gateway PR run reached a 5-second host-test subprocess timeout (5032 ms), with no release-controller exit status. The fixture now allows 8 seconds within the existing 10-second test budget and surfaces process errors explicitly. All 18 host lifecycle assertions still pass; failure outcomes are not treated as success.

## Merged release and restricted HTTPS acceptance

PR [5](https://github.com/KalacoolStudio/roleCast/pull/5) merged as `0bbb30fd6493b9d5669498b2fe7ae017512c762e`. Its final PR [CI run](https://github.com/KalacoolStudio/roleCast/actions/runs/34680612810) and automatic main [deployment run](https://github.com/KalacoolStudio/roleCast/actions/runs/34680821872) both passed. The integrated version includes the concurrent browser workspace and ATM changes, with 229 unit tests, 22 browser tests, production image/container and gateway smoke tests, and eight Terraform tests. Strict OpenSpec validation covers 13 items.

The VM reports release `8-0bbb30fd6493b9d5669498b2fe7ae017512c762e-642da7cfc965`, using image digest `sha256:72038cc9798f48b092f5b98485ec1d946c9b38da6b39f82dc29d935907201547`. Its required pre-release backup succeeded at `2026-09-12T07:32:37Z`: `backups/pre-release/20260912T073235Z-cc14001b-4e6d-45e8-8eb1-da556f92ba14.sqlite` in the existing backup bucket. Read-only production queries verified schema 5, SQLite integrity, both historical drills, accepted messages, custom plot and completed report.

While the gateway allowed only the approved operator, the legacy workspace was claimed through authenticated HTTPS. Its browser credential is stored locally in a mode-0600 ignored file and is not included in this repository. Two separate Chromium contexts rendered the historical report and the new synthetic HTTPS report; each received 404 for the other workspace's drill. The new workspace also received 404 for the legacy plot. The browser retained a Secure, HttpOnly, SameSite=Strict workspace cookie.

A bounded synthetic voice session reached provider readiness through WSS, sent 800 ms of silence, finalized successfully and produced a completed report. This verifies voice transport, not microphone capture or audible quality. Real SSE delivered an initial event through HTTPS. Test drill: `c511655b-a659-42a7-a0b2-a741e857bd35`; marked plot: `d3c89bf6-7ab8-4663-9905-252bca6446df` (`HTTPS 傳輸驗證 · 2026-09-12`). No additional provider calls were made when resuming browser verification.

One GET immediately after finishing the drill returned HTTP 400; the first helper stopped without capturing its body. The subsequent request found the completed report, and ten consecutive checks returned 200. No corresponding application error was present in the available container log. At this stage the cause was unconfirmed. The anonymous acceptance below subsequently reproduced and fixed it.

Direct Internet connections to VM TCP 22 and 8080 timed out. Terraform's post-apply plan returned no changes. At this stage anonymous browser invocation was denied (403). These restricted results completed task 3.2; final public acceptance follows.

## Anonymous access and stream connection correction

The user explicitly selected access for anyone with the link on 2026-09-12. The reviewed access plan updated only `google_cloud_run_v2_service.gateway[0].invoker_iam_disabled` from false to true. The legacy workspace was confirmed claimed, schema 5 passed integrity verification, and all historical acceptance records remained present before applying. Anonymous requests to the frontend, `/api/health` and `/api/runtime` then returned 200 with no Authorization header or Google sign-in.

A fresh anonymous synthetic drill (`3e65d2df-cf5e-454a-82a0-68ae8eaf5954`, plot `88a6a883-44dc-4e2b-9191-32c3e8355fae`, named `公開 HTTPS 傳輸驗證 · 2026-09-12`) reached voice-provider readiness through WSS, transmitted bounded silence, finalized and produced a report. Subsequent read-only verification reused that completed drill and made no extra model calls. Two anonymous Chromium contexts rendered successfully, preserved Secure/HttpOnly/SameSite=Strict cookies, and could not read each other's or the legacy workspace's records.

Completing SSE reproduced the prior HTTP 400 reliably: three completed streams each caused the following health request to return Fastify's HTTP-parser `Client Error`. Ordinary POST/GET sequences all succeeded. The app's SSE handler advertises `Connection: keep-alive`, while the gateway sends `Connection: close` upstream. [NGINX enables upstream keepalive caching by default since 1.29.7](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive); caching that completed SSE connection leads to reuse after the backend parser considers it closed.

The proxy now explicitly sets `keepalive 0` for its fixed upstream. The real-container fixture reproduces the application's SSE keep-alive response and asserts that the next health request succeeds. It failed with HTTP 400 before the fix and passed afterward, alongside all existing header, cookie, SSE, WebSocket, disconnect and upstream-failure checks. A reviewed gateway-only template update applied this configuration while preserving anonymous access. Ten completed production streams followed by ten health requests all returned 200, as did ten additional drill status requests. The earlier error is resolved by this regression-backed fix.

The public URL stayed unchanged when the coworker's subsequent main release `a1a75c4f5ae5b014ae19344b35ee1970a8b05049` deployed successfully in [run 34681229550](https://github.com/KalacoolStudio/roleCast/actions/runs/34681229550). Post-fix browser and SSE verification used that release. The VM reported `9-a1a75c4f5ae5b014ae19344b35ee1970a8b05049-aa72eb0f02b3`, image digest `sha256:8d5096f6481d67aec2de2fae9f657cc406828966540d13c689e7d55f10d8049c`, and successful pre-release backup at `2026-09-12T07:41:49Z` (`backups/pre-release/20260912T074147Z-b65dffe5-99bc-4a7d-8cc3-2f97486f5f06.sqlite`).

The final Terraform plan returned no changes. Direct VM TCP 22/8080 remained unreachable from the Internet. The isolated gateway fixture containers/network were removed and its dedicated local Docker daemon was stopped; the other worktree and processes were not changed. Operator and test workspace cookies remain mode-0600 ignored local artifacts. All eight Terraform scenarios passed with local production inputs reset to test defaults, formatting/lint passed, and strict OpenSpec validation passed all 15 current items.

Final access: **anonymous**, at **https://rolecast-gateway-pzc7so2xgq-de.a.run.app**. Browser isolation remains in force; visitor model usage consumes the project's configured provider credits.
