## 1. Incoming call presentation

- [x] 1.1 Implement the reference-style modal incoming popup with public Persona identity, plot-aware badges, responsive controls, and accessible status/focus; verify desktop/mobile screenshots, long custom names, short-height scrolling, keyboard containment, and unchanged workspace geometry.
- [x] 1.2 Connect answer and decline to existing voice/finish handlers, retain availability/error/disclosure states inside the popup, support safe dismissal/reopening per assignment, preserve stage/transcript access, and remove obsolete banner styles; verify answer/retry, decline without voice creation, subsequent-call preservation, focus restoration, and scroll cleanup using browser fixtures.

## 2. Integration and validation

- [x] 2.1 Update browser selectors and README labels for 「接聽」/「拒接」; verify the browser suite, production build, and lint/format checks pass.
- [x] 2.2 Record screenshots, behavioral results, and verification limits in validation.md; verify strict OpenSpec validation and git diff --check, keeping the completed change active for review.
