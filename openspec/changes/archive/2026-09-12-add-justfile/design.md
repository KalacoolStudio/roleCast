## Context

See proposal.md for motivation. The repository contains guidelines and OpenSpec configuration but no application entry point. This change introduces `just` as a developer prerequisite.

## Goals / Non-Goals

**Goals:** Make supported commands discoverable and executable without a configured application environment.

**Non-Goals:** Select an application framework or create placeholder setup, development, test, or build commands.

## Decisions

- Use a private first recipe that invokes `just --list`. This keeps the default invocation informative without listing an internal helper or starting a service. A handwritten command menu would duplicate recipe documentation.
- Expose a documented `status` recipe using shell `printf` to explain the current project state and point to README.md and guidelines. Future startup recipes should be added when their underlying commands exist.
- Document installation through the upstream `just` installation guide and show `just`, `just --list`, and `just status` in README.md. Do not automatically install software.

## Risks / Trade-offs

- Users may not have `just` installed → README.md provides the prerequisite and installation reference.
- Status text can become outdated → Replace the documentation-only status and update recipes and README when application implementation lands.
