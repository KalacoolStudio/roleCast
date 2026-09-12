# Website prototype style validation

Recorded on 2026-09-12. This change was documented retrospectively after the frontend work and local startup fix. The records below distinguish checks performed during implementation from the later documentation-only synchronization.

## Build and existing browser coverage

- `npm run build`: passed after the final frontend adjustments.
- `npm run check`: ESLint and Prettier passed after the final frontend adjustments.
- `git diff --check`: passed for the frontend implementation.
- `npm run test:e2e`: **17 tests passed** across `tests/browser/app.spec.js`, `stage.spec.js`, and `voice.spec.js` in 44.4 seconds. This was the complete existing browser suite with fixture providers, not a paid-provider test.

Coverage included desktop/mobile navigation and history, scenario selection and keyboard submission, refresh, call stopping and report evidence, returning interview roles, plot copy/edit/import/export, conflict preservation, live-stage identity and recovery, reduced motion, event-stream fallback, sprite movement, and voice lifecycle/ownership/caption behavior.

The full browser run preceded the final presentation adjustments to image framing, selected navigation colors, message colors, mobile header text, and image dimensions. Build and lint were rerun afterward, followed by the targeted visual checks below. No new unit-test run or complete browser-suite rerun after those adjustments is claimed.

## Final visual and asset checks

An ad hoc Chromium check after the final adjustments verified:

- Both built-in plot selections switch to their corresponding successfully loaded PNGs.
- A browser-intercepted custom plot uses the office fallback and remains selectable; that fixture was not persisted to the real database.
- No horizontal overflow at widths **320, 390, 768, 1024, 1200, and 1440px**.
- No page JavaScript errors during those checks.
- Desktop anti-fraud/interview home pages, the mobile home, and the plot library were visually reviewed. Existing browser-run screenshots also cover the drill and editor views.

Temporary visual evidence from that run exists at `/tmp/rolecast-style-desktop.png`, `/tmp/rolecast-style-interview.png`, `/tmp/rolecast-style-mobile.png`, and `/tmp/rolecast-style-studio.png`; the ad hoc script is `/tmp/rolecast-visual-check.mjs`. These are local, temporary artifacts and are not versioned regression tests. Routine browser screenshots are under ignored `test-results/`.

During OpenSpec reconciliation, all three files under `apps/web/public/assets/scenes/` were compared byte-for-byte with the corresponding files in the supplied prototype's `scenario-scenes/` directory and matched. No image generation, conversion, or remote image hosting was used.

## Development startup follow-up

`npm run dev` initially brought up Vite, then stopped when the backend could not bind. A diagnostic startup isolated the error to the listen phase with code `EADDRINUSE` on port 3000. The listening process belonged to the separate `gpt-live-1-test` project.

The only runtime adjustment was `PORT=3001` in RoleCast's ignored local `.env`. Existing application defaults and `.env.example` remain at port 3000; Vite remains fixed at 5173 and already forwards the configured backend port to its proxy. No server/proxy source changes were necessary.

After that adjustment:

- `npm run dev` started both Vite at `127.0.0.1:5173` and the backend at `127.0.0.1:3001`.
- Chromium loaded the actual development page, plot picker, and scene image without a Vite error overlay or page errors.
- `/api/health` returned HTTP 200 and `{"status":"ok"}` both directly on 3001 and through the Vite proxy on 5173.
- The verification server was stopped with Ctrl-C; both ports were confirmed released so the user's next startup would not collide with the check.

No live drill or paid model request was started by these startup checks. The unrelated project was not stopped. This port override does not change the published `local-runtime` contract.

## OpenSpec synchronization

The proposal, design, tasks, and two capability deltas describe the implemented state. Synchronization added three interface requirements and corrected the stale plain-background stage requirement. All seven original interface scenarios and all 15 original stage scenarios are preserved; six interface scenarios were added. The main specs contain no delta-operation headers or duplicate scenarios. Historical archives remain unchanged.

- `openspec validate align-website-prototype-style --strict --no-interactive`: passed.
- `openspec validate --specs --strict --no-interactive`: **10 specs passed, 0 failed**.
- `openspec validate --all --strict --no-interactive`: **11 items passed, 0 failed** (10 specs and this change).
- `git diff --check`: passed.
- `openspec status --change align-website-prototype-style --json`: all four schema artifacts are complete.

All nine tasks are complete. The change remains active and its deltas are already synchronized; archive is a separate follow-up. This reconciliation edited OpenSpec documentation only and reused the implementation/runtime evidence above without rerunning application tests.

## Main integration — 2026-09-12

The later merge of `origin/main` (`b915e04`) into `style` preserves this theme and artwork with main's voice-only controls, browser workspaces, ATM drawer, and deployment-specific disclosures. Active style deltas now describe voice controls and the correct start/storage prerequisites; historical text-era checks above remain the original evidence. Combined validation is recorded in [the introduction change](../add-anti-fraud-chat-intro/validation.md#main-integration--2026-09-12).
