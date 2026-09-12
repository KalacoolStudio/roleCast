## Context

See `proposal.md` for motivation. `App` in `apps/web/src/main.jsx` renders the left sidebar beside `<main>` and owns drill/report selection, editable view state, event subscriptions, and the voice hook. Main at `7e2c4ac` replaces inline history with `HistoryReports`, removes the home background field, and adds the modal `IncomingCall` presentation.

`style.css` uses a sticky 218px sidebar, reduces it to 190px at 1000px, and switches to a full-width header at 700px. The sidebar links to the dedicated report page; report lists and timelines are rendered inside `<main>`. `home.css` sizes the existing CSS brand mark. The separate `AtmDrawer` already implements its own toggle.

This design resolves how collapse interacts with responsive report navigation, keyboard focus, and the lifetime of the current workspace before implementation.

## Goals / Non-Goals

**Goals:**

- Keep one stable sidebar toggle and one navigation tree across both layouts.
- Make collapse a local presentation update that does not remount the workspace or change drill subscriptions.
- Retain the current expanded dimensions and main's dedicated report navigation.

**Non-Goals:**

- No application-shell component extraction, new icon dependency, alternate navigation system, or modal menu.
- No persistent sidebar preference, backend setting, or ATM drawer changes.

## Decisions

### Keep collapse state in the existing application shell

Add a boolean state initialized to expanded in `App`. The toggle changes only this state; it does not call `select()`, `voice.stop()`, or any API. Do not reset it from navigation callbacks or viewport changes. A full page load resets the state naturally.

This keeps the existing component tree, editor drafts, and live voice hook stable. Persistent browser storage was considered but adds a preference contract that the request does not require. An extracted sidebar component would introduce prop plumbing without helping this bounded UI change.

### Separate the persistent header from collapsible contents

Group the brand and native `type="button"` toggle in a sidebar header. Group existing navigation actions, including the report entry and count, and footer in a body with a stable ID. Give the body a flex column layout and `min-height: 0` on desktop so the footer can remain at the bottom of the navigation.

Hide the body with an explicit `display: none` rule while collapsed, keeping its descendants mounted. Do not rely on width, transforms, opacity, or `aria-hidden` alone: those can leave offscreen controls keyboard-accessible. The report list, selected detail, and timeline remain mounted in the main workspace. The collapse toggle does not invoke `openReports()` or alter the drill/report route.

Keep the same toggle DOM node in both states. Use `aria-expanded`, `aria-controls` targeting the body, and the labels `收合側邊欄` / `展開側邊欄`. A small inline SVG or CSS chevron can convey direction, with decorative graphics hidden from assistive technology. Retain the shared focus outline and give the toggle at least a 44px hit area.

### Use a desktop rail and a compact mobile header

Above 700px, collapse the sidebar to approximately 64px with padding that fits the toggle. Hide the brand in this state so the rail contains the expand control. Expanded desktop layout keeps the existing brand and navigation; arrange the toggle and brand without shrinking the toggle hit area or overflowing the 190px sidebar.

At 700px and below, keep the sidebar full-width and show the brand and toggle in a compact header. Collapse hides the body and reduces vertical space. Expansion restores the current inline navigation actions, including the history-report entry. The same collapse state drives both layouts, so crossing breakpoints does not unexpectedly reopen navigation.

At 1100px and below, stack the report index/detail and report feedback cards into one column. Main's original 700px report breakpoint leaves too little detail width when desktop navigation is expanded just above 700px. Keep report list scrolling and the desktop two-column layout above 1100px.

The main area already uses `flex: 1` and `min-width: 0`, allowing it to use the released desktop width. Use immediate layout changes; no new size animation is necessary. This also avoids introducing motion for users who prefer reduced motion. A modal drawer was considered but would add an overlay and focus-management behavior beyond the current navigation model.

### Preserve main's incoming-call dialog and reporting lifecycle

The sidebar toggle remains outside the native incoming-call dialog. While the dialog is open, its existing background inertness and focus containment take precedence. After dismissing it, the user can collapse navigation and reopen the same assignment; answering retains the sidebar state. Do not change the dialog, ring tone, permission checks, or provider lifecycle to make the toggle usable through a modal.

Retain main's report hashes, automatic routing when a drill terminates, and protection against clearing the currently selected drill snapshot when returning from reports. Keep the home background input removed. Sidebar tests use the current `接聽` action and `finishDrill` helper so they respect modal dismissal and report routing.

## Risks / Trade-offs

- [Collapsed navigation hides reports accidentally] → Hide only the sidebar body and verify the main report list, selected detail, and route stay intact.
- [Added wrapper displaces the footer on short desktop viewports] → Preserve flex sizing, use `min-height: 0`, and verify report navigation and the footer remain visible.
- [Brand and toggle crowd the medium-width sidebar] → Review both expanded desktop widths and the 700px boundary; allow the expanded header arrangement to wrap or stack deliberately.
- [Workspace state changes during a layout refactor] → Keep the `<main>` tree and hooks stable; verify selected plots, editor drafts, selected reports, and active voice connection identity while toggling.
- [Collapsed navigation takes an extra action to access] → Keep the expand button visible and keyboard-accessible across views and viewport sizes.

## Validation

Extend the existing browser coverage rather than adding unit tests that mirror the toggle implementation. In `tests/browser/app.spec.js`, exercise desktop collapse/expand, accessible state and keyboard focus, exclusion of hidden controls from Tab navigation, editor-draft and selected-report preservation, in-page navigation while collapsed, reload defaults, and mobile report navigation. Check both states for overflow at 320, 390, 700, 701, 768, 1000, 1024, and 1440px and inspect representative desktop/mobile screenshots.

Use the existing fake-media setup and voice gateway statistics in `tests/browser/voice.spec.js` to confirm that an active call survives toggling with the same drill/call, no new voice connection or microphone request, continuing media, and retained captions. Run the affected app and voice browser suites plus existing marketplace, stage, and workspace suites because they share the shell. Run `npm run check`, `npm run build`, `npx vitest run tests/stage.test.js`, and `openspec validate --all --strict`; record actual results in a change-local validation record.

## Migration Plan

Ship with the normal frontend build; no data migration is needed. Reverting the frontend change restores the previous sidebar, with no persisted preference or server state to clean up. Keep the change active for review and later spec synchronization/archive through the project's workflow.
