## Why

The website's green visual theme did not match the supplied RoleCast prototype. This retrospective change records the implemented orange-and-cream styling, illustrated scenario selection, and verification, then reconciles the published specs with the current application.

## What Changes

- Apply the reference's RoleCast wordmark, four-bar mark, warm surfaces, orange accents, rounded panels, and typography to the home page and shared navigation, drill, report, and plot editor styling.
- Present a large scenario illustration beside the plot picker on wide screens, with a stacked layout on narrow screens. Keep plot selection, optional background, start/resume, history, and voice controls usable.
- Switch preview artwork and practice topics for the built-in anti-fraud and interview plots. Use a generic office illustration for custom plots; preview topics do not prescribe future role assignments.
- Bundle three unmodified reference PNGs in the project so the page does not depend on the original prototype directory.
- Correct the published stage requirement that still describes a plain background: the existing implementation already uses an illustrated office. This is a specification correction, not a new stage renderer or animation change.

## Capabilities

### New Capabilities

None; this change extends the existing interface specifications.

### Modified Capabilities

- `text-training-ui`: Shared prototype styling, illustrated plot selection, and responsive, accessible home-page controls.
- `drill-stage-presentation`: Office background and consistent shared styling, preserving the existing workspace and control requirements.

## Impact

- Frontend: `apps/web/src/Home.jsx`, `home.css`, `main.jsx`, `style.css`, `stage/stage.css`, and `apps/web/index.html`.
- Assets: `apps/web/public/assets/scenes/{marketplace-fraud,interview-panel,office-background}.png`.
- Existing APIs, persistence, plot definitions, agent behavior, and dependencies are unchanged.
- A follow-up startup check found another local project using port 3000. RoleCast's ignored `.env` now uses `PORT=3001`; the application's default remains 3000 and Vite remains on 5173. This machine-specific adjustment is recorded in validation, not promoted to a new runtime default or a `local-runtime` delta.
- Planning artifacts are written after implementation at the user's request. Validation distinguishes the completed browser suite from subsequent visual and development-server checks.
- Integration with main retains its voice-only calls, workspace isolation, voice availability checks, and deployment-specific storage disclosures. The active deltas are reconciled with those contracts so a later sync cannot restore retired text controls or local-only cloud notices.
