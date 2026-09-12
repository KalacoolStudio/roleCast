## Why

Starting the anti-fraud plot currently goes straight to call planning, omitting the prepared marketplace chat shown in the supplied prototype. The user wants that chat, beginning exactly with 「您好，耳機還在嗎？配件都有嗎？」, when starting「防詐警覺演練」.

## What Changes

- Show a prepared marketplace chat with Lin before creating the anti-fraud call drill: headphone listing, the reference conversation, failed-order attachment, and customer-service contact card.
- Reveal the chat in order, with replay and show-all controls. Support reduced motion, keyboard operation, and mobile screens.
- Let the customer-service callback action start the existing call drill using the selected plot and optional background. Let independent verification end the example with an explanatory result and return/replay controls.
- Keep the prepared conversation explicitly identified as an example and separate from real transcripts, scoring, and model context. Interview/custom plots retain their current start flow.
- Bundle the supplied buyer and headphone photos locally.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-training-ui`: Prepared anti-fraud introduction, example interactions, and the explicit handoff to the existing drill.

## Impact

- Frontend app routing/state, a dedicated introductory-chat component and stylesheet, two public photo assets, and browser coverage.
- No API, database, default-plot, call-boundary, or scoring changes. The reference's seller/NT$1,800 example remains a labelled introduction; the subsequent call drill retains its own saved facts and prompts.
- OpenSpec artifacts precede implementation. On completion, publish the interface delta and record validation while retaining the change for review.
- Main-branch integration preserves the incoming voice-only interface, browser workspace isolation, ATM actions, and deployment behavior alongside this introduction; reconcile published specs and rerun combined checks before completing the merge.
