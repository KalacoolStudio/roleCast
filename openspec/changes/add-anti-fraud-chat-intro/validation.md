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
