## Purpose

Protect exercise records across cloud releases, VM restarts, backup operations, and recovery while preserving the current single-writer SQLite and interrupted-session semantics.

## ADDED Requirements

### Requirement: Persistent cloud records
Cloud exercise data SHALL reside on a dedicated persistent data disk, independently of the image and VM boot filesystem. The data disk SHALL be retained across VM replacement and protected from accidental infrastructure deletion. Initialization SHALL recognize existing filesystems and data, refuse unexpected devices, and never reformat an existing data volume during startup or deployment.

#### Scenario: Replace a release
- **WHEN** a new application image replaces the existing image
- **THEN** previously completed, failed, and interrupted exercises remain readable from the same persistent data volume

#### Scenario: Recreate the VM
- **WHEN** an operator follows the documented VM replacement procedure
- **THEN** the retained data disk can be attached to the replacement without reinitializing its records

### Requirement: One application writer and explicit restart behavior
At most one application process SHALL own the production database at a time. Replacement and recovery SHALL stop the previous application before starting another against the same data. After restart, unfinished exercises SHALL be marked interrupted with accepted records preserved; the service SHALL NOT imply that in-flight model work resumed.

#### Scenario: Release during an active exercise
- **WHEN** a deployment restarts the backend while an exercise is active
- **THEN** the restored interface shows the interrupted exercise and its accepted records, and users can start a new exercise

#### Scenario: Concurrent replacement attempt
- **WHEN** another deployment or recovery operation attempts to acquire database ownership
- **THEN** it waits or fails without starting a second application writer

### Requirement: Consistent off-VM backups
The deployment SHALL create consistent database backups at least daily and before allowing a replacement release to mutate existing production data. Backups SHALL preserve committed SQLite state, including data not yet checkpointed from WAL, and SHALL be verified before being reported successful. Backup objects SHALL be private, stored outside the VM, identified by time and release metadata, and retained for a configurable period with a default of 30 days. Backup failures and backup age SHALL be inspectable by an operator.

#### Scenario: Scheduled backup during normal operation
- **WHEN** the daily backup runs while the application is using WAL
- **THEN** a consistent copy is validated and stored privately outside the VM without losing committed records or interrupting the active exercise

#### Scenario: Required release backup fails
- **WHEN** a release cannot produce and store its required verified backup
- **THEN** the replacement is aborted and the previous application is kept running or restarted if it was already stopped

### Requirement: Data-safe release recovery
A failed replacement SHALL attempt to recover the previous known-good image only if that image supports the current data schema. Recovery SHALL reuse the current data volume without clearing it or silently restoring an older backup. If safe image recovery is impossible or also fails, the workflow SHALL retain the database and release/backup identities and report the required operator intervention. A first deployment without a previous image SHALL fail clearly without inventing a successful rollback.

#### Scenario: Compatible previous image
- **WHEN** a candidate fails and the prior image supports the current data schema
- **THEN** the previous image is restarted against the preserved data and its health result is reported

#### Scenario: Incompatible previous image
- **WHEN** the candidate changed the schema beyond what the previous image supports
- **THEN** automatic image rollback is refused and the current data remains available for explicit recovery

### Requirement: Explicit and verifiable restoration
The repository SHALL document and provide an operator-invoked restore procedure that validates a selected backup and compatible image, stops application writers, preserves the pre-restore data, and checks the restored database before serving it. Restoration SHALL NOT run as an automatic fallback in the deployment workflow. The procedure SHALL identify the backup recovery point and make the potential loss of later records explicit.

#### Scenario: Restore a selected backup
- **WHEN** an operator explicitly restores a verified backup using the documented procedure
- **THEN** the selected records are readable, interrupted-session semantics are applied, and the previous data remains separately recoverable

#### Scenario: Invalid backup
- **WHEN** a selected backup fails integrity validation
- **THEN** the procedure aborts without replacing the current production database
