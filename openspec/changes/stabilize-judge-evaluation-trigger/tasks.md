## 1. Evaluation scheduling

- [x] 1.1 Add configurable stabilization and maximum-wait limits plus per-attempt timer ownership to the voice coordinator, verified by focused timing tests.
- [x] 1.2 Schedule ordinary Judge evaluation from accepted user transcript activity while keeping periodic checkpoints persistence-only, verified for stable and continuously arriving fragments.
- [x] 1.3 Preserve one in-flight accumulated follow-up, immediate ATM evaluation, and deterministic conversation closure, verified by existing and new voice coordinator tests.

## 2. Lifecycle safety and validation

- [x] 2.1 Clear evaluation timers during stop, failure, and disposal while draining final accepted evidence exactly once, verified by cleanup and stale-result tests.
- [x] 2.2 Run the focused voice/storage suites, the full unit suite, and strict OpenSpec validation; verify all checks pass.
