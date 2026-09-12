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

The restricted gateway is provisioned at `https://rolecast-gateway-pzc7so2xgq-de.a.run.app`. It uses Cloud Run gen2 with the required 512 MiB memory. Anonymous `/api/health` returned 403; approved-operator identity-token requests to `/`, `/api/health` and `/api/runtime` returned 200 with the expected frontend, healthy database and GCP mode. Tokens remained in memory. `GCP_APPLICATION_URL` is configured in GitHub production variables. The original VM, data disk and runtime credentials were not changed by this apply. Application migration and selected-policy acceptance remain pending tasks 3.2–3.3. Successful local checks do not imply anonymous access or completed Google sign-in setup.

The first gateway PR run reached a 5-second host-test subprocess timeout (5032 ms), with no release-controller exit status. The fixture now allows 8 seconds within the existing 10-second test budget and surfaces process errors explicitly. All 18 host lifecycle assertions still pass; failure outcomes are not treated as success.
