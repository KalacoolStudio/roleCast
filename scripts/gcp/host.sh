#!/usr/bin/env bash
# Installed by Terraform on COS. Runtime/backup helpers come from the release image.
set -Eeuo pipefail
umask 077
ROOT=${ROLECAST_ROOT:-/var/lib/rolecast}
DATA=${ROLECAST_DATA:-/mnt/disks/rolecast}
RUN=${ROLECAST_RUN:-/run/rolecast}
STATE="$DATA/state"
APP="$DATA/app"
BACKUPS="$DATA/backups"

fail() { printf '%s\n' "$*" >&2; return 1; }
data_device_exists() { [[ -b "$DATA_DEVICE" ]]; }
load_settings() {
  # Root-owned, Terraform-generated file; never source a release or secret env file.
  source "$ROOT/settings"
  mkdir -p "$RUN"
  chmod 700 "$RUN"
  export DOCKER_CONFIG="$RUN/docker-config"
  mkdir -p "$DOCKER_CONFIG"
  printf '{"credHelpers":{"%s":"gcr"}}\n' "${IMAGE_REPOSITORY%%/*}" > "$DOCKER_CONFIG/config.json"
}
mounted() {
  data_device_exists || return 1
  [[ "$(findmnt -rn -o SOURCE --mountpoint "$DATA")" == "$(readlink -f "$DATA_DEVICE")" ]] || return 1
  [[ "$(findmnt -rn -o FSTYPE --mountpoint "$DATA")" == ext4 ]]
}
valid_id() { [[ "$1" =~ ^[1-9][0-9]{0,11}-[a-f0-9]{40}-[a-f0-9]{12}$ ]]; }
valid_image() {
  [[ "${1%@sha256:*}" == "$IMAGE_REPOSITORY" && "${1##*@sha256:}" =~ ^[a-f0-9]{64}$ ]]
}
release_info() {
  valid_id "$1" || return 1
  RELEASE_IMAGE=$(cat "$STATE/releases/$1/image") || return 1
  RELEASE_COMMIT=$(cat "$STATE/releases/$1/commit") || return 1
  RELEASE_GENERATION=$(cat "$STATE/releases/$1/generation") || return 1
  valid_image "$RELEASE_IMAGE" && [[ "$RELEASE_COMMIT" =~ ^[a-f0-9]{40}$ && "$RELEASE_GENERATION" =~ ^[1-9][0-9]{0,11}$ ]]
}
pointer() { [[ ! -f "$STATE/$1" ]] || cat "$STATE/$1"; }
atomic() {
  printf '%s\n' "$2" > "$STATE/.$1.tmp"
  sync -f "$STATE/.$1.tmp"
  mv -f "$STATE/.$1.tmp" "$STATE/$1"
  sync -f "$STATE"
}
result() {
  atomic result "ROLECAST_RESULT=$1"
  printf 'ROLECAST_RESULT=%s\n' "$1"
}
tool() {
  local image=$1
  shift
  docker run --rm --network host --user 0 --read-only --tmpfs /tmp \
    --mount "type=bind,src=$APP,dst=/data" \
    --mount "type=bind,src=$BACKUPS,dst=/backups" \
    --mount "type=bind,src=$STATE,dst=/state" \
    --mount "type=bind,src=$RUN,dst=/runtime" \
    --entrypoint node "$image" "$@"
}
health() {
  local attempt
  for attempt in {1..30}; do
    if curl -fsS --max-time 3 http://127.0.0.1:8080/api/health 2>/dev/null | grep -qx '{"status":"ok"}'; then
      if curl -fsS --max-time 3 http://127.0.0.1:8080/ 2>/dev/null | grep -qi '<html'; then return 0; fi
    fi
    sleep 2
  done
  return 1
}
prepare() {
  mkdir -p "$DATA"
  data_device_exists || fail "Expected persistent data device is missing."
  if ! blkid "$DATA_DEVICE" >/dev/null 2>&1; then
    [[ ! -f "$ROOT/data-initialized" ]] || fail "Previously initialized disk is unreadable; refusing to format it."
    [[ "$INITIALIZE_DATA_DISK" == true ]] || fail "Uninitialized disk; explicit first-bootstrap initialization is required."
    [[ -z "$(wipefs --no-act --noheadings --output TYPE "$DATA_DEVICE")" ]] || fail "Device contains an unexpected filesystem signature."
    mkfs.ext4 -L rolecast-data "$DATA_DEVICE"
  fi
  [[ "$(blkid -s TYPE -o value "$DATA_DEVICE")" == ext4 && "$(blkid -s LABEL -o value "$DATA_DEVICE")" == rolecast-data ]] || fail "Unexpected data filesystem."
  if ! mountpoint -q "$DATA"; then mount -o defaults,nodev,nosuid "$DATA_DEVICE" "$DATA"; fi
  mounted || fail "Persistent disk verification failed."
  touch "$ROOT/data-initialized"
  sync -f "$ROOT/data-initialized"
  mkdir -p "$APP" "$STATE/releases" "$BACKUPS"
  chmod 700 "$STATE" "$BACKUPS"
  chown 1000:1000 "$APP"
  chmod 700 "$APP"
}
boot_recovery() {
  exec 8> "$RUN/operation.lock"
  flock -w 120 8
  # A reboot never starts an unverified candidate over the retained data.
  if [[ -f "$STATE/transaction" ]]; then
    local previous
    [[ "$(pointer transaction)" != restore-* ]] || fail "Interrupted data restore requires operator review; no application was started."
    previous=$(pointer current)
    if [[ -z "$previous" ]]; then fail "First deployment was interrupted; retry from main."; fi
    release_info "$previous"
    docker pull "$RELEASE_IMAGE"
    if [[ -f "$APP/role-cast.sqlite" ]]; then tool "$RELEASE_IMAGE" scripts/gcp/database.js compatible /data/role-cast.sqlite >/dev/null; fi
    atomic active "$previous"
    rm -f "$STATE/transaction"
    result recovered-after-reboot
  elif [[ -f "$STATE/current" ]]; then
    atomic active "$(pointer current)"
  fi
  flock -u 8
}
begin_operation() {
  touch "$RUN/deploying"
  trap 'rm -f "$RUN/deploying"' EXIT
}
run_app() {
  mounted || fail "Persistent disk is not mounted; refusing temporary storage."
  if [[ ! -f "$RUN/deploying" ]]; then boot_recovery; fi
  local active
  active=$(pointer active)
  if [[ -z "$active" ]]; then printf 'Awaiting first deployment.\n'; return; fi
  release_info "$active"
  exec 9> "$RUN/writer.lock"
  flock -n 9 || fail "Another application writer owns the data."
  docker pull "$RELEASE_IMAGE"
  rm -f "$RUN/runtime.env"
  tool "$RELEASE_IMAGE" scripts/gcp/cloud.js env "/state/releases/$active/config.json" /runtime/runtime.env
  docker rm rolecast >/dev/null 2>&1 || true
  docker run --name rolecast --read-only --tmpfs /tmp --init \
    --cap-drop ALL --security-opt no-new-privileges \
    --log-opt max-size=10m --log-opt max-file=3 \
    --env-file "$RUN/runtime.env" --publish 8080:8080 \
    --mount "type=bind,src=$APP,dst=/data" "$RELEASE_IMAGE"
}
stop_app() {
  systemctl stop rolecast.service || return 1
  # A failed service stop is never followed by another writer.
  [[ "$(docker inspect --format '{{.State.Running}}' rolecast 2>/dev/null || true)" != true ]]
}
backup() {
  local id=$1 label=$2 image commit object file
  release_info "$id" || return 1
  image=$RELEASE_IMAGE
  commit=$RELEASE_COMMIT
  [[ -f "$APP/role-cast.sqlite" ]] || { printf 'No existing database to back up.\n'; return 0; }
  file="$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid).sqlite"
  object="backups/$label/$file"
  if tool "$image" scripts/gcp/database.js backup /data/role-cast.sqlite "/backups/$file" "$commit" "$image" &&
     tool "$image" scripts/gcp/cloud.js upload "/backups/$file" "$BACKUP_BUCKET" "$object" &&
     tool "$image" scripts/gcp/cloud.js upload "/backups/$file.json" "$BACKUP_BUCKET" "$object.json"; then
    atomic backup-status "$(date -u +%FT%TZ) OK gs://$BACKUP_BUCKET/$object"
    atomic backup-last-success "$(pointer backup-status)"
    rm -f "$BACKUPS/$file" "$BACKUPS/$file.json"
    return 0
  fi
  atomic backup-status "$(date -u +%FT%TZ) FAILED $object"
  return 1
}
recover() {
  local previous=$1
  stop_app || { result recovery-stop-failed; return 1; }
  [[ -n "$previous" ]] || { result failed-first-release; return 1; }
  release_info "$previous" || { result invalid-previous-release; return 1; }
  if [[ -f "$APP/role-cast.sqlite" ]]; then
    tool "$RELEASE_IMAGE" scripts/gcp/database.js compatible /data/role-cast.sqlite >/dev/null || { result incompatible-schema; return 1; }
  fi
  atomic active "$previous" || return 1
  systemctl reset-failed rolecast.service || return 1
  if systemctl start rolecast.service && health; then
    atomic current "$previous" || return 1
    rm -f "$STATE/transaction"
    result rolled-back
    return 0
  fi
  stop_app || true
  result rollback-failed
  return 1
}
deploy() {
  local image=$1 commit=$2 generation=$3 previous id watermark
  valid_image "$image" && [[ "$commit" =~ ^[a-f0-9]{40}$ && "$generation" =~ ^[1-9][0-9]{0,11}$ ]] || fail "Invalid release identity."
  mounted || fail "Persistent disk is not mounted."
  exec 8> "$RUN/operation.lock"
  flock -w 120 8
  begin_operation
  previous=$(pointer current)
  watermark=$(pointer generation-watermark)
  watermark=${watermark:-0}
  [[ "$watermark" =~ ^(0|[1-9][0-9]{0,11})$ ]] || fail "Invalid deployment generation watermark."
  if (( generation < watermark )); then result skipped-stale; return; fi
  if [[ -f "$STATE/transaction" ]]; then
    [[ "$(pointer transaction)" != restore-* ]] || fail "Resolve the interrupted data restore before deploying."
    if [[ -n "$previous" ]]; then recover "$previous" || return 1; else stop_app || return 1; fi
  fi
  if [[ -n "$previous" ]]; then
    release_info "$previous"
    if (( generation < RELEASE_GENERATION )); then result skipped-stale; return; fi
    if [[ "$image" == "$RELEASE_IMAGE" && "$commit" == "$RELEASE_COMMIT" ]] &&
       cmp -s "$ROOT/config.json" "$STATE/releases/$previous/config.json" && health; then
      atomic generation-watermark "$generation"
      result already-current; return
    fi
  fi
  # Missing registry credentials or secrets fail before stopping the running release.
  result preflight
  docker pull "$image" || { result preflight-failed; return 1; }
  id="$generation-$commit-$(tr -d '-' < /proc/sys/kernel/random/uuid | cut -c1-12)"
  mkdir "$STATE/releases/$id"
  printf '%s\n' "$image" > "$STATE/releases/$id/image"
  printf '%s\n' "$commit" > "$STATE/releases/$id/commit"
  printf '%s\n' "$generation" > "$STATE/releases/$id/generation"
  cp "$ROOT/config.json" "$STATE/releases/$id/config.json"
  if ! tool "$image" scripts/gcp/cloud.js env "/state/releases/$id/config.json" /runtime/preflight.env; then
    rm -f "$RUN/preflight.env"
    result preflight-failed
    return 1
  fi
  rm -f "$RUN/preflight.env"
  atomic transaction "$id"
  if ! stop_app; then result stop-failed; return 1; fi
  # Use the previous image for the pre-mutation backup when it exists.
  if ! backup "${previous:-$id}" pre-release; then
    recover "$previous" || true
    fail "Required backup failed; candidate was not started."
  fi
  atomic active "$id"
  systemctl reset-failed rolecast.service
  if systemctl start rolecast.service && health; then
    if [[ -n "$previous" ]]; then atomic previous "$previous"; fi
    atomic generation-watermark "$generation"
    atomic current "$id"
    rm -f "$STATE/transaction"
    result deployed
  else
    recover "$previous" || true
    fail "Candidate failed verification; inspect recovery outcome."
  fi
}
restore() {
  local file=$1 id=$2 previous quarantine
  [[ "$file" =~ ^[A-Za-z0-9_-]+\.sqlite$ ]] && valid_id "$id" || fail "Specify a staged backup basename and a known release ID."
  mounted || fail "Persistent disk is not mounted."
  exec 8> "$RUN/operation.lock"
  flock -w 120 8
  begin_operation
  release_info "$id"
  tool "$RELEASE_IMAGE" scripts/gcp/database.js verify "/backups/$file" >/dev/null
  previous=$(pointer current)
  [[ -n "$previous" ]] || fail "Restore requires an existing deployment."
  atomic transaction "restore-$id"
  stop_app || fail "Could not stop application writers."
  quarantine="$STATE/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)"
  mkdir "$quarantine"
  for suffix in '' -wal -shm; do
    if [[ -e "$APP/role-cast.sqlite$suffix" ]]; then mv "$APP/role-cast.sqlite$suffix" "$quarantine/"; fi
  done
  install -o 1000 -g 1000 -m 600 "$BACKUPS/$file" "$APP/role-cast.sqlite"
  atomic active "$id"
  systemctl reset-failed rolecast.service
  if systemctl start rolecast.service && health; then
    atomic previous "$previous"
    atomic current "$id"
    rm -f "$STATE/transaction"
    result restored
    printf 'Pre-restore files retained at %s\n' "$quarantine"
  else
    stop_app || true
    fail "Restore did not become healthy; preserved source files remain at $quarantine."
  fi
}
main() {
  load_settings
  case "${1:-}" in
    prepare) prepare ;;
    run) run_app ;;
    cleanup) rm -f "$RUN/runtime.env" "$RUN/preflight.env" ;;
    operation-cleanup) rm -f "$RUN/deploying" ;;
    deploy) [[ $# == 4 ]] || fail "deploy requires image, commit, generation"; deploy "$2" "$3" "$4" ;;
    submit)
      [[ $# == 4 ]] || fail "submit requires image, commit, generation"
      valid_image "$2" && [[ "$3" =~ ^[a-f0-9]{40}$ && "$4" =~ ^[1-9][0-9]{0,11}$ ]] || fail "Invalid release identity."
      # The release continues under systemd even if the SSH client disconnects.
      local code=0
      systemd-run --wait --collect --unit="rolecast-release-$4-$(date +%s)" \
        --property=Type=oneshot --property=TimeoutStartSec=600 \
        --property="ExecStopPost=/bin/bash $ROOT/host.sh operation-cleanup" \
        /bin/bash "$ROOT/host.sh" deploy "$2" "$3" "$4" || code=$?
      [[ ! -f "$STATE/result" ]] || cat "$STATE/result"
      return "$code" ;;
    backup)
      mounted || fail "Persistent disk is not mounted."
      exec 8> "$RUN/operation.lock"; flock -w 120 8
      local current; current=$(pointer current)
      [[ -n "$current" ]] || { printf 'No release yet.\n'; return; }
      backup "$current" scheduled ;;
    rollback)
      mounted || fail "Persistent disk is not mounted."
      exec 8> "$RUN/operation.lock"; flock -w 120 8
      begin_operation
      local previous; previous=$(pointer previous)
      [[ -n "$previous" ]] || fail "No previous release."
      atomic transaction "manual-rollback"
      recover "$previous" || return 1
      atomic current "$previous" ;;
    restore) [[ $# == 4 && "$4" == --replace-current-data ]] || fail "restore requires backup basename, release ID, and --replace-current-data"; restore "$2" "$3" ;;
    status)
      [[ ! -f "$STATE/result" ]] || cat "$STATE/result"
      local current; current=$(pointer current)
      if [[ -n "$current" ]]; then release_info "$current"; printf 'release=%s\ncommit=%s\nimage=%s\n' "$current" "$RELEASE_COMMIT" "$RELEASE_IMAGE"; fi
      if [[ -f "$STATE/backup-status" ]]; then cat "$STATE/backup-status"; else printf 'No backup attempt recorded.\n'; fi
      if [[ -f "$STATE/backup-last-success" ]]; then printf 'last-success: %s\n' "$(pointer backup-last-success)"; else printf 'No successful backup recorded.\n'; fi ;;
    *) fail "Usage: host.sh prepare|run|cleanup|submit|deploy|backup|rollback|restore|status" ;;
  esac
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
