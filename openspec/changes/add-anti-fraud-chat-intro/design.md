## Context

See `proposal.md` for motivation. The reference HTML contains a scripted marketplace conversation and contact card before its mock phone screen. RoleCast currently creates a drill directly from the home callback and lets Mastermind plan the first real call. Its built-in anti-fraud facts differ from the reference's seller/NT$1,800 example.

## Goals / Non-Goals

**Goals:** Reproduce the requested example entry screen and provide working progression into the existing call drill without treating scripted seller text as participant evidence.

**Non-Goals:** A live buyer chatbot, changing saved plot facts/prompts, importing a mock phone result as a real report, or creating a new persisted drill state.

## Decisions

- Add a dedicated `MarketplaceIntro` component, opened by the home start action for plot ID `anti-fraud`. The existing drill creation callback is invoked only by the contact-card action. Other plots and history retain the current flow. A frontend-only introduction avoids creating model jobs or incomplete drills merely to show sample text.
- Keep the introduction state in memory. Return/home/editor/history navigation clears it; refreshing before callback returns to the normal home/active-drill lookup. Preserve the existing background field until actual creation.
- Label the chat as a prepared example and label the handoff as a separate call exercise. Keep its NT$1,800 listing and exact opening/replies from the reference. Sending those scripted replies as messages or replacing saved anti-fraud plot facts would misrepresent user behavior and is outside this change.
- Copy `buyer.jpg` and `headphones.jpg` to public marketplace assets. Build the order notice as React markup and use a native modal dialog for enlargement, Escape handling, and focus return. The contact card represents an example contact rather than a link to a real service.
- Reveal message rows with one cancellable timeout at a time; show the opening immediately. Provide show-all and replay. Respect reduced motion by showing everything immediately; cancel pending playback when leaving, verifying, or starting the drill. Do not auto-scroll the whole page or play unsolicited sound.
- Reuse the existing action/error handling for callback creation. Disable repeated submission while acting. If another tab has started a drill, the conflict's active ID permits resuming it without silently creating a second drill.
- Extend browser tests to verify the entry point, ordering, image/modal controls, replay, cancellation, no early API creation, preserved background, and absence of scripted report evidence. Adapt existing browser setup helpers to continue through the new intro when tests target calls.
- When integrating main, retain its voice-only call controls, workspace initialization and scoped history/API behavior, deployment-specific storage copy, and ATM drawer. The introduction still precedes drill creation and explicit microphone acceptance. Browser helpers must enter calls through the intro and use the same browser workspace for test API setup. Merge the published voice/workspace/ATM contracts with the style and introduction requirements rather than restoring the earlier text-entry contract.

## Risks / Trade-offs

- Sample details differ from the existing call plot → Identify the sample and subsequent call as separate phases; never inject sample data into facts or evaluation.
- A timed intro can slow navigation and tests → Include show-all and reduced-motion behavior, and keep return/verification controls available.
- Old browser tests assume immediate drill creation → Centralize their start helper while adding dedicated intro coverage so regressions cannot be hidden by that helper.
- Async creation can fail or conflict → Keep the intro mounted with error and retry/resume controls until a drill is successfully selected.

## Migration Plan

The introduction requires no schema or data migration. Main's independent runtime/storage migrations remain authoritative during integration. Build and serve the new frontend assets normally. Existing saved drills open unchanged within their owning workspace. Rollback of the introduction consists of restoring the home start callback and removing the intro component/styles and photos after confirming no later dependencies.
