## Why

The left navigation sidebar permanently reserves space beside the workspace on desktop and above it on mobile. Users need a collapse/expand button so they can give the scenario, conversation, or editor more room and restore navigation when needed.

## What Changes

- Add a visible button to collapse and expand the left navigation sidebar, initially expanded, while respecting the existing modal focus behavior.
- Collapse desktop navigation into a narrow rail containing the expand control; collapse mobile navigation into a compact header containing the brand and expand control.
- Hide navigation actions, including the history-report entry, and the sidebar footer while collapsed, and restore their existing behavior when expanded; history lists and report details remain in the main workspace.
- Preserve the current view, editor drafts, selected report, drill, and live voice connection when toggling. Keep the collapse choice while navigating and resizing within the current page; a full page load starts expanded.
- Provide Traditional Chinese accessible button labels, expanded-state semantics, visible keyboard focus, and no focusable hidden navigation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-training-ui`: Add responsive, accessible collapse/expand behavior to the shared left navigation sidebar.

## Impact

- `apps/web/src/main.jsx`: Sidebar state, markup, and toggle handling in the application shell.
- `apps/web/src/style.css`: Expanded and collapsed layouts at the existing desktop and mobile breakpoints, retaining the orange/cream visual identity.
- `tests/browser/app.spec.js` and `tests/browser/voice.spec.js`: Focused coverage of toggling, navigation, responsive layout, and active-call continuity.
- Frontend-only change; no API, data migration, or dependency changes. The independently toggleable right-side ATM drawer retains its existing contract.

## Main integration

Integrate with main at `7e2c4ac`, retaining its dedicated historical reports, automatic terminal-drill report routing, incoming-call popup, and removed home background field. Collapse controls the shared navigation only; the popup retains its normal temporary background inertness. This updates the sidebar change to the current UI without restoring the removed inline history list or background input.
