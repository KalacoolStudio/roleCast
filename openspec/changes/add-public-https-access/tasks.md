## 1. Gateway infrastructure and transport

- [x] 1.1 Add a digest-pinned Cloud Run gateway, dedicated service identity/subnet, fixed private upstream firewall, explicit access modes and URL output; verify Terraform formatting, validation and tests for each policy and upstream isolation.
- [x] 1.2 Add repository-owned NGINX configuration preserving Host, HTTPS cookies, Origin and WebSocket/SSE transport; verify a real container smoke test with fixture upstream, incremental events, bidirectional frames, bounded upstream failure and no arbitrary-target forwarding.
- [x] 1.3 Add the gateway smoke to CI and preserve automatic VM deployments; verify workflow lint and that no production credential is needed by the new check.

## 2. Workspace integration and operational documentation

- [x] 2.1 Fix the voice browser test's microphone/utterance ordering and verify the exact evidence anchor; run the affected voice browser suite.
- [x] 2.2 Make container restart/restore smoke retain a real workspace cookie without a fixture auth bypass; verify the full production image smoke with network-disabled model fixtures and schema-5 data.
- [x] 2.3 Document public HTTPS provisioning, access choices, first-time IAP setup, costs, browser-bound workspace behavior and restricted-mode rollback; reconcile previous deployment artifacts with optional public access and current workspace isolation, then validate all OpenSpec artifacts.

- [x] 2.4 Allow bounded cold-start overhead in the host test subprocess and surface spawn errors instead of accepting a null exit status; verify all 18 host lifecycle tests pass.

## 3. Live rollout and acceptance

- [x] 3.1 Review and apply a plan that adds the restricted gateway without replacing the VM or data disk; verify the deployed gateway reaches the private upstream using operator authentication and record the generated HTTPS URL.
- [ ] 3.2 Merge a passing release through the existing main workflow; verify schema-5 migration, backup and retained records, and establish operator ownership of legacy data before anonymous access.
- [ ] 3.3 Apply the user's selected gateway access mode and verify the real public HTTPS frontend, API, secure workspace cookies, two-browser isolation, streaming/voice transport and blocked direct VM ports; record policy, commit, URL and evidence, and remove temporary resources.
