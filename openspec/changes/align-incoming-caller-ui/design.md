## Context

See proposal.md for the reference and requested refinement. `main.jsx` owns the pending assignment, voice activation, finish command, and workspace. The initial `IncomingCall` component is a grid item that pushes the stage and chat downward. Call actions already work and remain unchanged.

## Goals / Non-Goals

- Present incoming calls as a phone-like popup without adding document height, moving the stage/chat, or resetting saved scroll positions.
- Keep actual caller identity, explicit answer/decline actions, microphone checks, and public disclosures.
- Do not change backend lifecycle, replace the existing ringing tone, open a microphone or provider session automatically, or introduce a modal dependency.

## Decisions

### Native modal dialog with a compact phone presentation

Use a native `dialog` opened with `showModal()` to obtain top-layer rendering, background inertness, and keyboard focus containment. Its fixed, centered position stays outside grid layout; render it next to the workspace instead of as a grid item. Use the reference's dark teal surface, circular caller badge, red/green actions with decorative handset icons, a rounded card, and a dimmed backdrop. Limit width to 420px and height to the viewport with internal scrolling for short screens and long identities. The top layer prevents the fixed ATM tab from overlapping the caller.

Preserve document dimensions while locking background scrolling by compensating for any removed scrollbar width. Restore prior body styles on close/unmount, including React Strict Mode cleanup. The stage and conversation remain mounted in the same grid. A custom fixed overlay would require recreating inertness and keyboard handling; keeping an inline panel would retain the reported layout issue.

### Deliberate dismissal and reopening

Track the dismissed pending assignment in `main.jsx`. A new assignment opens automatically; dismissal only hides that assignment's popup, and subsequent snapshot updates do not reopen it. A 「查看來電」 button replaces the existing pending-state pill in the title area without adding a row. It reopens the same assignment. Escape, the close button, and a backdrop click dismiss without calling any API. Disable dismissal while acceptance or decline is preparing so the pending action remains visible.

Focus the caller heading on open and wrap Tab between enabled actions so focus does not advance to browser chrome. On dismissal, focus the status-area trigger without scrolling. Restore a connected prior focus target when the dialog disappears; otherwise move focus to an available call control. Keep the native dialog lifecycle tied to the visibility prop and clean up on drill navigation, acceptance, or terminal state.

### Existing identity, actions, and error handling

Use actual public Persona name/role, the interview HR/olive badge, and name-based orange/blue badges for anti-fraud/custom plots. Retain the existing voice-start and finish-drill callbacks. 「拒接」 still ends the drill, without accepting the pending call or opening a microphone. Put permission/command failures inside the dialog because the background is inert; manual retry remains available. Keep active-call errors in their existing location after the pending assignment is accepted. Share existing voice disclosures in both presentations.

### Verification

Update caller tests to query dialog semantics and verify open/close/reopen geometry, unchanged document/transcript scroll, keyboard containment and restoration, short-height overflow, and a new assignment opening after a previous dismissal. Keep meaningful acceptance, denial/retry, unavailable voice, and decline-without-media checks. Existing tests that operate the stage or finish controls while ringing must first dismiss the modal. Use the project's fixture provider and synthetic microphone.

### Integration with main

Preserve main's dedicated historical report pages, report timeline, automatic terminal-drill report routing, and revised waiting/desk/office stage positions. The optional background field remains removed from the home UI. Keep the shared voice disclosure needed by the popup while letting `HistoryReports` own report/evidence rendering.

When returning to the already selected drill from another view, retain its current snapshot. The feed remains subscribed to that drill, so clearing the snapshot without changing the drill ID could leave the workspace loading indefinitely until another event arrives.

Main's local incoming-call tone continues while a popup is merely dismissed because the same assignment remains pending. It stops when answering begins, when navigating to reports or the plot editor, and when the pending assignment changes or ends. Reopening a dismissed popup does not create a second tone, microphone, or provider session. Browser helpers decode both drill and report routes; voice-resource assertions distinguish a later call's intended local ring from an ended call's microphone resources.

## Risks / Trade-offs

- A modal temporarily blocks workspace interaction → Escape, a close button, and backdrop dismissal preserve the pending call and reveal the unchanged workspace.
- Permission and finish errors would be hidden behind the backdrop → Surface them within the popup until the call is accepted.
- Long identities or short viewports can exceed card height → Bound the dialog to viewport height and allow internal scrolling without horizontal overflow.
- Closing a modal can alter scroll/focus → Preserve body sizing/styles and use focus restoration with `preventScroll`.

## Migration Plan

No data migration, assets, or new dependencies are required. Build the normal frontend bundle. Keep revised proposal, deltas, tasks, and validation under the same active change for review; do not archive or synchronize published specs as part of this refinement.
