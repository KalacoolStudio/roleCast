## Why

The repository has no command entry point or instructions explaining how to run it. Users need a discoverable `justfile` that accurately describes the current documentation-only project.

## What Changes

- Add a root `justfile` whose default recipe lists documented commands without starting services.
- Add a `status` recipe explaining that the application is not implemented yet and pointing to the project documentation.
- Add a README explaining the `just` prerequisite and available commands.

## Capabilities

### New Capabilities

None. This change only adds developer tooling and documentation; `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

Adds `justfile` and `README.md`. Running the recipes requires `just` and a POSIX shell. Application frameworks, dependencies, and startup commands remain undecided and are outside this change.
