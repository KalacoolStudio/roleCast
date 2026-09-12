# Public HTTPS gateway validation

Prepared on 2026-09-12 in `roleCast-task-2`, branch `gcp-ci-deploy`, based on main `2e6771524d4f0d8d34dccdc070d9af012fd99057`. Integrated the subsequent ATM-action main commit `b915e04`; the combined version passed 229 unit tests and 22 browser tests. The other worktree and its processes remain independent. Production access policy is pending the user's choice; initial gateway provisioning uses restricted operator IAM invocation.

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

The restricted gateway is provisioned at `https://rolecast-gateway-pzc7so2xgq-de.a.run.app`. It uses Cloud Run gen2 with the required 512 MiB memory. Anonymous `/api/health` returned 403; approved-operator identity-token requests to `/`, `/api/health` and `/api/runtime` returned 200 with the expected frontend, healthy database and GCP mode. Tokens remained in memory. `GCP_APPLICATION_URL` is configured in GitHub production variables. The original VM, data disk and runtime credentials were not changed by this apply. Application migration completed in the release below; selected-policy acceptance remains pending task 3.3. Successful local checks do not imply anonymous access or completed Google sign-in setup.

The first gateway PR run reached a 5-second host-test subprocess timeout (5032 ms), with no release-controller exit status. The fixture now allows 8 seconds within the existing 10-second test budget and surfaces process errors explicitly. All 18 host lifecycle assertions still pass; failure outcomes are not treated as success.

## Merged release and restricted HTTPS acceptance

PR [5](https://github.com/KalacoolStudio/roleCast/pull/5) merged as `0bbb30fd6493b9d5669498b2fe7ae017512c762e`. Its final PR [CI run](https://github.com/KalacoolStudio/roleCast/actions/runs/34680612810) and automatic main [deployment run](https://github.com/KalacoolStudio/roleCast/actions/runs/34680821872) both passed. The integrated version includes the concurrent browser workspace and ATM changes, with 229 unit tests, 22 browser tests, production image/container and gateway smoke tests, and eight Terraform tests. Strict OpenSpec validation covers 13 items.

The VM reports release `8-0bbb30fd6493b9d5669498b2fe7ae017512c762e-642da7cfc965`, using image digest `sha256:72038cc9798f48b092f5b98485ec1d946c9b38da6b39f82dc29d935907201547`. Its required pre-release backup succeeded at `2026-09-12T07:32:37Z`: `backups/pre-release/20260912T073235Z-cc14001b-4e6d-45e8-8eb1-da556f92ba14.sqlite` in the existing backup bucket. Read-only production queries verified schema 5, SQLite integrity, both historical drills, accepted messages, custom plot and completed report.

While the gateway allowed only the approved operator, the legacy workspace was claimed through authenticated HTTPS. Its browser credential is stored locally in a mode-0600 ignored file and is not included in this repository. Two separate Chromium contexts rendered the historical report and the new synthetic HTTPS report; each received 404 for the other workspace's drill. The new workspace also received 404 for the legacy plot. The browser retained a Secure, HttpOnly, SameSite=Strict workspace cookie.

A bounded synthetic voice session reached provider readiness through WSS, sent 800 ms of silence, finalized successfully and produced a completed report. This verifies voice transport, not microphone capture or audible quality. Real SSE delivered an initial event through HTTPS. Test drill: `c511655b-a659-42a7-a0b2-a741e857bd35`; marked plot: `d3c89bf6-7ab8-4663-9905-252bca6446df` (`HTTPS 傳輸驗證 · 2026-09-12`). No additional provider calls were made when resuming browser verification.

One GET immediately after finishing the drill returned HTTP 400; the first helper stopped without capturing its body. The subsequent request found the completed report, and ten consecutive checks returned 200. No corresponding application error was present in the available container log. The cause of that isolated response is unconfirmed; no transport failure or repeated status error was reproduced.

Direct Internet connections to VM TCP 22 and 8080 timed out. Terraform's post-apply plan returned no changes. Anonymous browser invocation remains denied (403); the selected public access mode is still pending. These results complete task 3.2 and the transport portion of 3.3, but do not claim that visitors can yet open the URL without operator authentication.
