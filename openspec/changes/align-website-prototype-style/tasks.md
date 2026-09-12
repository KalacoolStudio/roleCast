This is a retrospective checklist. Checked implementation and runtime tasks were completed before this OpenSpec reconciliation; `validation.md` identifies the corresponding evidence and limits.

## 1. Prototype styling and assets

- [x] 1.1 Copy the three selected reference PNGs into the public scene directory; verify identical source/destination bytes and successful browser image loads.
- [x] 1.2 Extract the home presentation and shared four-bar mark while retaining existing app callbacks; verify built-in selection, custom-plot fallback, optional background, and start/resume wiring in the source and browser checks.
- [x] 1.3 Apply shared orange/cream styling to navigation, the home page, drill controls, reports, and plot editor; verify the build and lint/format checks pass and review desktop/mobile screenshots.
- [x] 1.4 Preserve responsive navigation, image alternatives, selected-state semantics, labels, and focus styles; verify no horizontal overflow at 320, 390, 768, 1024, 1200, and 1440px and review existing keyboard/history coverage.

## 2. Integration and local startup

- [x] 2.1 Run the existing browser suite covering text, stage, plot authoring, history, and voice interactions; record its 17 passing tests and the later CSS/visual-check boundary in `validation.md`.
- [x] 2.2 Resolve the observed local port collision using the ignored `.env` override; verify `npm run dev`, the frontend and images at 5173, and backend/proxied health responses at 3001/5173, then stop the verification server and confirm both ports are released.

## 3. OpenSpec reconciliation

- [x] 3.1 Record the implemented scope in proposal, design, and delta specs, including the existing office-stage discrepancy and local-only port adjustment; verify all schema-required artifacts exist and agree with the implementation.
- [x] 3.2 Merge the two delta specs into the published capabilities and link the active change from the OpenSpec index; verify unrelated requirements and original stage scenarios are preserved.
- [x] 3.3 Validate the completed change and published specs with strict OpenSpec checks and `git diff --check`; record the results in `validation.md`.
