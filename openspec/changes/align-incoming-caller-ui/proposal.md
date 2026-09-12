## Why

The supplied `caller-ui.png` and prototype `seller-invitation.html` establish a dark teal phone-call presentation with a caller badge and red/green actions. The first implementation inserts this screen above the workspace and pushes the chat downward; the requested refinement presents it as a popup while preserving the underlying layout.

## What Changes

- Present each pending call in a compact, centered dark teal modal popup with a dimmed backdrop, caller badge, ringing status, and red/green phone actions. Keep the stage and conversation in their original layout and preserve their scroll positions.
- Allow closing the popup with Escape, its close button, or the backdrop without answering or declining; reopen the same pending call from the existing drill status area. New assignments automatically open their own popup.
- Show the actual assigned Persona's public name and role, an olive HR badge for the interview plot, and name-based badges for other plots.
- Rename the existing voice acceptance action to 「接聽」 and add 「拒接」 using the existing finish-drill action. Declining ends the drill and requests its normal report without accepting a call or opening the microphone.
- Preserve explicit microphone activation, error/retry states, voice availability, deployment disclosures, stage visibility, saved transcripts, and accessible mobile controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-training-ui`: Reference-style incoming call presentation and functional answer/decline actions.
- `drill-stage-presentation`: Incoming popup above an unchanged responsive stage/conversation workspace, with deliberate dismissal and reopening.

## Impact

- Frontend: incoming-call component/styles, `main.jsx`, shared legacy banner styles, and stage layout styles.
- Validation/docs: browser call selectors, focused decline/responsive/identity coverage, README control labels, and OpenSpec validation record.
- No new API, persistence, assets, dependencies, or provider behavior. The reference remains read-only; the presentation is built with React and CSS.

## Non-goals

- Adding a skipped-call lifecycle, changing the existing ringing tone, timed auto-answer, or changing active-call controls.
- Hard-coding prototype caller names or importing its simulated call completion logic.
