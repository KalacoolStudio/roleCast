## Context

This document describes the implementation already present in the working tree; see `proposal.md` for motivation. The application uses React/JSX and Vite, with a shared stylesheet covering navigation, conversations, reports, and the plot editor. The live stage has its own stylesheet and existing office/sprite assets.

The supplied reference is `anti-fraud-prototype-20260912T060626Z-1-001/anti-fraud-prototype/`, alongside this repository. Its `seller-invitation.html` and home screenshots establish the visual reference. Only the three required scene PNGs were copied; the reference's simulated commerce/call flows were not imported.

## Goals / Non-Goals

**Goals:**

- Keep presentation separate from existing drill, voice, and plot state management.
- Reuse the reference images locally and provide a predictable illustration for custom plots.
- Describe the completed work and its evidence accurately in OpenSpec.

**Non-Goals:**

- Changing API contracts, stored plots, agent scheduling, voice behavior, or stage choreography.
- Adding the reference's security/customer-service scenarios as built-in plots.
- Changing the default backend port for every installation or automatically stopping another project's server.

## Decisions

### Shared theme and an extracted home component

`Home.jsx` receives the existing plot selection, background, action state, active drill ID, and callbacks from `main.jsx`. Main-branch integration also supplies deployment mode and voice availability, retaining the incoming start prerequisites and local/GCP disclosure. The anti-fraud introduction change now precedes that plot's creation callback. `CastMark` provides the four-bar CSS mark for the hero and navigation.

`style.css` defines shared theme variables: accent `#d94825`, background `#f6f5f2`, panel `#fffdf9`, text `#25303a`, muted text `#65717b`, and line `#e4e6e9`. `home.css` owns the illustrated layout; the stage stylesheet uses the shared variables for its surrounding controls and captions. User message bubbles use the reference's teal accent with dark text. The document title and browser theme color follow the new branding.

Copying the prototype's standalone HTML was an alternative, but would bring unrelated mock interaction logic and a fixed scenario list. Reusing the existing React handlers preserves custom plots, history, and real calls.

### Bundled illustration mapping

The preview selects an image by stable built-in plot ID and obtains its title, category, description, and duration from the available plot data:

| Plot | Copied asset | Practice topics |
| --- | --- | --- |
| `anti-fraud` | `marketplace-fraud.png` | 識別異常、保護資訊、主動查證 |
| `interview` | `interview-panel.png` | 資料庫遷移、架構取捨、清楚表達 |
| Other IDs | `office-background.png` | 進入情境、多角色互動、回顧與成長 |

All three PNGs live under `apps/web/public/assets/scenes/`. Their source bytes are preserved; Vite serves and builds them locally. A scene selection is presentation state, not a request to the backend. Topic pills describe practice themes rather than a promised sequence of roles. The generic fallback also handles copied/imported plots with new IDs.

Referencing the sibling directory would break a separate checkout or deployment. Generating new artwork was unnecessary because the user supplied and authorized copying the reference assets.

### Responsive layout and existing navigation

Wide screens show the hero above an illustration/picker grid. At 1100px and below the grid becomes a vertical sequence; the existing navigation switches to its mobile presentation at 700px. Desktop scene framing retains the supplied landscape aspect ratio, while narrow screens use a 4:3 crop. The picker remains a list of native buttons so all saved plots remain available, with `aria-pressed` selection and visible keyboard focus. Textarea labels, image alternatives, the history toggle, and the external-inference disclosure are retained.

The reference's dropdown was an alternative; retaining buttons keeps the existing selection interaction and browser coverage. Existing stage responsive and reduced-motion behavior is preserved.

During main-branch integration, voice-only call controls replace the former text composer. Remove obsolete composer/typing-summary styles while retaining the illustrated stage, captions, microphone controls, and incoming ATM drawer. Update active stage scenarios to describe voice controls; original text-era validation remains historical evidence.

### Reconcile the office-stage specification

The previous published stage requirement said “plain background,” but `stage.css` already references `/assets/backgrounds/office.png`. The delta corrects that outdated requirement and records the shared palette. The live stage keeps its existing background asset, sprite mapping, positions, event feed, and timing. The home page's separately copied office image does not replace the live-stage asset.

### Local development port follow-up

Startup failed with `EADDRINUSE` while `gpt-live-1-test` occupied port 3000. Changing the ignored local `.env` to `PORT=3001` resolved it. Existing `scripts/dev.js` forwards the resolved port to Vite's HTTP/WebSocket proxy; Vite remains at `127.0.0.1:5173`. The default in source and `.env.example` remains 3000. This is deployment-specific configuration, so `local-runtime` needs no requirement change.

## Risks / Trade-offs

- Original PNGs increase the static payload by about 5.5 MiB → Keep only the three used images; compression can be a separate optimization if needed.
- Narrow-screen image cropping hides some peripheral artwork → Keep all functional controls and practice topics outside the illustration, with descriptive alternative text.
- Custom plot previews use generic artwork → Preserve the selected plot's actual public metadata rather than infer a fixed role sequence from its name.
- Existing browser tests cover behavior but not pixel equivalence → Record separate visual inspection and image-switching checks, including which checks followed the final CSS adjustments.

## Migration Plan

No database or API migration is required. Run the normal Vite build to include the bundled assets. To roll back the visual change, restore only the touched frontend files and remove the added home component, stylesheet, and scene assets after confirming they have no later dependents. Existing plot and drill data remain compatible. Restore the local port only when the desired port is available.

This retrospective change is synced into the published specs and kept active for review. Archived historical change records remain intact.
