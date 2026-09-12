# Validation — 2026-09-12

## Implemented behavior

- Starting the built-in `anti-fraud` plot opens the prepared marketplace chat with Lin, beginning exactly with 「您好，耳機還在嗎？配件都有嗎？」. Ordered replies, failed-order notice, and the customer-service contact card follow the supplied prototype.
- The chat supports timed playback, show-all, replay, native-dialog enlargement with Escape and focus return, and an independent-verification explanation. Reduced motion shows the complete chat immediately.
- Only 「申請客服回電」 creates the existing call drill. The optional background is retained; retries and active-drill conflicts use existing error/resume handling. Navigating away or refreshing before callback does not create a drill.
- Prepared seller replies are labelled examples and excluded from real transcripts, reports, and model inputs. The subsequent call retains the selected plot's own facts and prompts. Interview/custom starts and historical drill restoration retain their prior flow.
- `buyer.jpg` (99,421 bytes) and `headphones.jpg` (46,177 bytes) were copied from the supplied `anti-fraud-prototype/` into `apps/web/public/assets/marketplace/`. Byte comparisons confirmed both copies match their source files; runtime does not depend on the reference directory.

## Checks

| Check | Result |
| --- | --- |
| `npm run build` | Passed; Vite production bundle generated |
| `npm run check` | Passed; ESLint and Prettier |
| `npm run test:e2e -- tests/browser/marketplace.spec.js` | 3 passed |
| `npm run test:e2e` | 20 passed, including text, plots, stage, and voice regression coverage |
| `openspec validate --specs --strict --no-interactive` | 10 specs passed after synchronization |
| `openspec validate --all --strict --no-interactive` | 12 items passed: 10 specs and 2 active changes |
| `git diff --check` | Passed |

Browser assertions cover the exact opening, message ordering, photo loading, keyboard attachment activation/close, replay, no early drill creation, background preservation, failed creation/retry, active-drill conflict/resume, navigation/reload, and absence of sample text in saved drill/report data. Mobile checks at 320, 390, and 768 CSS pixels found no horizontal overflow.

Desktop (1440px) and mobile (390px) screenshots were captured and visually inspected:

- `test-results/marketplace-anti-fraud-sta-07dab-ation-do-not-create-a-drill/marketplace-desktop.png`
- `test-results/marketplace-mobile-reduced-b4b18-es-from-history-and-reports/marketplace-mobile.png`

Screenshots are generated test output and are not committed. Browser tests use the controlled local test provider and temporary database; these results do not constitute a paid-model or physical-microphone check. This change does not modify backend or model behavior.

## OpenSpec synchronization

Proposal, design, delta, and tasks were written before implementation. The delta's requirement, **Prepared anti-fraud marketplace introduction**, and all six scenarios are merged into `openspec/specs/text-training-ui/spec.md`. The capability index and application README describe the entry flow. Existing published requirements are preserved. The change remains active for review and later archive.

## Main integration — 2026-09-12

Merged fetched `origin/main` at `b915e04` into `style`, after preserving the staged introduction and its OpenSpec plan in `576745b`. The earlier validation above describes the pre-merge interface; this section records the combined implementation.

- Resolved conflicts in README, the main React view, shared/stage styles, and browser tests. Retained the orange/cream home, local illustrations, and prepared anti-fraud chat while preserving main's voice-only calls, workspace initialization and ownership, stable Persona voices, ATM actions, runtime disclosures, and deployment files.
- Passed deployment mode and voice availability into the extracted home component. Its start button retains main's prerequisites and its privacy notice correctly distinguishes local storage from GCP browser workspaces.
- Updated call-flow test helpers for the intro and voice-only controls. Workspace tests still use two independent browser contexts; the callback-conflict test uses the current page's cookie context. The first combined run exposed an initial-history read before the workspace cookie was ready; waiting for the enabled start control and asserting the history request succeeds fixed that test setup race.
- Reconciled published interface/stage/runtime specs and active style/deployment deltas so future synchronization cannot restore text-entry requirements, local-only storage notices, or shared global history. Preserved the ATM, workspace, and voice requirements imported from main. The three new cloud capability deltas retain their incoming active-change location; cloud deployment and archive state were not advanced.

| Combined check | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run check` | Passed after merge resolution and test adjustment |
| Unit/integration portion of `npm test` | 229 tests passed across 19 files |
| `npm run test:e2e` after workspace setup fix | 25 passed; includes all 3 chat tests, voice availability/activation, ATM evidence, cloud disclosures, and concurrent isolated workspaces |
| `openspec validate --all --strict --no-interactive` | 14 items passed: 11 published specs and 3 active changes |
| Conflict-marker scan and `git diff --check` | No markers or whitespace errors |

Reviewed the generated desktop home, desktop stage/call, and mobile ATM screenshots after resolving styles. No backend implementation differs from the incoming main branch. Checks used temporary data and fixture providers; no live GCP deployment, production-data operation, paid-model check, or physical-microphone check was performed for this merge.
