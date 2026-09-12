Sections 1–3 record the original implementation before main replaced inline history with dedicated reports and removed the home background field. Section 4 tracks reconciliation with that updated UI; its acceptance criteria supersede the retired history/background checks.

## 1. Sidebar behavior and layout

- [x] 1.1 Add initially expanded sidebar state, a persistent header/toggle, and an identified collapsible body in `apps/web/src/main.jsx`; verify the button updates its Traditional Chinese accessible name, `aria-expanded`, and body visibility without invoking navigation, voice, or API actions.
- [x] 1.2 Refactor sidebar rules in `apps/web/src/style.css` for the existing expanded widths, a compact desktop rail, and a mobile brand/toggle header; verify the toggle remains usable in both states, the main content uses released space, desktop history still scrolls, and hidden contents cannot receive keyboard focus.

## 2. Behavior verification

- [x] 2.1 Extend `tests/browser/app.spec.js` with collapse/expand coverage for keyboard activation and retained focus, hidden navigation exclusion from Tab order, restored selection/history, home and editor draft preservation, navigation while collapsed, and expanded defaults after reload; verify the added browser checks pass.
- [x] 2.2 Cover mobile history opened before collapse, restoration after expansion, history closure after selecting a record, and retained collapse across resizing; verify no horizontal overflow in both states at 320, 390, 700, 701, 768, 1000, 1024, and 1440px, review desktop/mobile screenshots, and check reduced-motion behavior.
- [x] 2.3 Extend the existing fake-media voice coverage in `tests/browser/voice.spec.js` to toggle during a live call; verify the same drill/call and connection remain active, microphone request and greeting counts do not increase, media continues, and existing captions remain visible.

## 3. Integration and validation record

- [x] 3.1 Run `npm run check`, `npm run build`, `npx playwright test tests/browser/app.spec.js tests/browser/voice.spec.js tests/browser/marketplace.spec.js tests/browser/stage.spec.js`, and `openspec validate --all --strict`; resolve change-related failures and record command results, screenshot review, and any verification limits in `openspec/changes/collapsible-navigation-sidebar/validation.md`.

## 4. Main integration

- [x] 4.1 Resolve the application-shell conflict while preserving main's report routing, navigation, and incoming-call dialog; reconcile the proposal, design, and sidebar delta with current behavior and verify the merged production build succeeds.
- [x] 4.2 Adapt sidebar browser coverage to independent history-report pages, selected report and editor-draft preservation, mobile layout, and incoming-popup focus/voice continuity; verify the focused sidebar tests and review desktop/mobile screenshots.
- [x] 4.3 Run lint/format, stage unit tests, the app/voice/marketplace/stage/workspace browser suites, and strict OpenSpec validation; append merge validation evidence and complete the local merge with no unresolved conflicts.
