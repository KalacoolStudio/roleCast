# Validation — 2026-09-12 popup refinement

## Implemented behavior

- Pending calls open a compact, centered dark teal modal with a dimmed backdrop, public caller identity, an HR or name-based badge, and red/green phone actions. The stage and conversation retain their original size, position, and scroll state.
- Escape, the close button, or the backdrop dismisses the popup without calling an API. The existing status area offers 「查看來電」 to reopen the same pending assignment. Later assignments open automatically.
- Focus enters the popup, Tab wraps between enabled actions, and background controls cannot take focus while it is open. Closing restores focus and body scrolling. Short viewports scroll inside the popup; the ATM tab cannot overlap it.
- Answer and decline retain the existing voice-start and finish-drill behavior. Permission errors remain visible inside the popup with manual retry. Decline preserves earlier transcripts without accepting the pending call or opening a microphone.

## Automated checks

- `npm run build` — passed on the final implementation.
- `npm run check` — passed; the final startup-helper edit also passed targeted ESLint and Prettier checks.
- `npm run test:e2e` — **29/29 passed** on the final code and test helpers, including history, plot editing, marketplace introduction, stage choreography, workspace isolation, captions, ATM, and voice lifecycle.
- Popup checks cover unchanged stage/chat bounding boxes and document height across dismissal/reopening; preserved document and transcript scroll; Escape, backdrop, close button, keyboard wrapping, and focus restoration; a later assignment opening after the previous one was dismissed; unavailable voice and microphone denial/retry; decline without media startup or transcript loss.
- Responsive checks cover 320/390/768/1024/1440px widths, long caller names/roles, and an internally scrollable 320×480 viewport without horizontal overflow.
- `openspec validate --all --strict` — **17/17 passed**.
- `git diff --check` — passed.

Existing browser helpers now wait for the incoming-call state after starting and deliberately dismiss the popup before using background finish controls. This removes the old inline-screen assumption; no forced clicks or bypassed modal controls are used.

## Visual review

Reviewed desktop/mobile screenshots for the compact phone presentation, centered badge, handset actions, dimmed background, long-name wrapping, and short-height scrolling. Screenshots from the final browser run are available in ignored test output:

- `test-results/voice-incoming-interview-m-229d3-d-decline-never-opens-voice/incoming-interview-desktop.png`
- `test-results/voice-incoming-interview-m-229d3-d-decline-never-opens-voice/incoming-interview-mobile.png`
- `test-results/voice-incoming-custom-iden-5c958--voice-still-allows-decline/incoming-custom-320.png`
- `test-results/voice-incoming-custom-iden-5c958--voice-still-allows-decline/incoming-short-viewport.png`

The earlier inline implementation passed 28 browser tests and 3 follow-up checks before this popup refinement. Its presentation and screenshots are superseded by the final results above.

## Limits and OpenSpec status

Tests used the existing fake provider and synthetic microphone. No real-device microphone, paid-provider access, or speech-quality claim is made. No backend, data migration, external assets, or dependencies changed.

The revised proposal, design, two deltas, completed tasks, and this validation record remain under active change `align-incoming-caller-ui` for review. Published specs have not been synchronized and the change has not been archived.

## Main merge validation — 2026-09-12

Integrated `origin/main` at `72faa76` (drill reports and office call staging) into `caller-screen` at `7242c9b` (caller popup UI). Resolved conflicts in `README.md`, `apps/web/src/main.jsx`, and `tests/browser/marketplace.spec.js` while preserving both the modal caller presentation and main's report history, timeline, automatic report routing, revised stage positions, and removed home background input.

The pending-call tone now stops when leaving for reports or the plot editor, continues when only dismissing the popup, and resumes when returning to the pending call. Returning to the already selected drill retains its snapshot instead of clearing it while its existing feed stays subscribed; a regression test reproduced the otherwise indefinite loading state and passes with the fix. No navigation or popup dismissal acquires a microphone or opens a provider session.

Browser helpers support the new report URLs and distinguish local ringing audio from microphone-resource cleanup. The rebuilt merged app passed the full suite after these integration fixes:

- `npm run test:unit` — **231/231 passed** across 19 files.
- `npm run test:e2e` — **30/30 passed**, including popup layout/accessibility, report history/evidence, office staging, ringing/navigation/resume, ATM, workspace isolation, and voice lifecycle.
- `npm run build` — passed.
- `npm run check` — passed (ESLint and Prettier).
- `openspec validate --all --strict` — **17/17 passed**.
- `git diff --check` — passed; no conflict markers remain in application, test, or OpenSpec files.

The browser tests still use the fixture provider and synthetic microphone. This active change remains available for review; main's published-spec updates are retained without synchronizing or archiving this popup change.
