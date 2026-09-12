source "$SCRIPT"
mounted(){ [[ "${FAIL_MOUNT:-0}" != 1 ]]; }
data_device_exists(){ [[ "${FAIL_DEVICE:-0}" != 1 ]]; }
docker(){
  printf 'docker %s\n' "$*" >> "$CALLS"
  if [[ "$1" == pull && "${FAIL_PULL:-0}" == 1 ]]; then return 1; fi
  if [[ "$1" == inspect ]]; then printf 'false\n'; fi
  return 0
}
tool(){
  printf 'tool %s\n' "$*" >> "$CALLS"
  if [[ "$3" == env && "${FAIL_SECRET:-0}" == 1 ]]; then return 1; fi
  if [[ "$3" == backup && "${FAIL_BACKUP:-0}" == 1 ]]; then return 1; fi
  if [[ "$3" == compatible && "${FAIL_COMPAT:-0}" == 1 ]]; then return 1; fi
  if [[ "$3" == verify && "${FAIL_VERIFY:-0}" == 1 ]]; then return 1; fi
  if [[ "$3" == upload && "${FAIL_UPLOAD:-0}" == 1 ]]; then return 1; fi
  return 0
}
systemctl(){
  printf 'systemctl %s\n' "$*" >> "$CALLS"
  if [[ "$1" == stop ]]; then
    [[ "${FAIL_STOP:-0}" != 1 ]] || return 1
    rm -f "$RUN/writer"
  fi
  if [[ "$1" == start ]]; then
    [[ ! -e "$RUN/writer" ]] || { echo 'SECOND WRITER' >&2; return 99; }
    pointer active > "$RUN/writer"
  fi
  return 0
}
health(){
  if [[ "${SLOW_HEALTH:-0}" == 1 ]]; then sleep 0.3; fi
  local active; active=$(pointer active)
  if [[ "${FAIL_HEALTH:-0}" == 1 && "$active" != "$OLD_ID" ]]; then return 1; fi
  if [[ "${FAIL_ROLLBACK_HEALTH:-0}" == 1 && "$active" == "$OLD_ID" ]]; then return 1; fi
  return 0
}
blkid(){
  if [[ "${EMPTY_DISK:-0}" == 1 && ! -f "$RUN/formatted" ]]; then return 2; fi
  if [[ "$1" == -s && "$2" == TYPE ]]; then printf '%s\n' "${FS_TYPE:-ext4}"; fi
  if [[ "$1" == -s && "$2" == LABEL ]]; then printf '%s\n' "${FS_LABEL:-rolecast-data}"; fi
}
wipefs(){ printf '%s' "${DEVICE_SIGNATURE:-}"; }
mkfs.ext4(){ echo formatted >> "$RUN/formatted"; }
mountpoint(){ [[ -f "$RUN/mounted" ]]; }
mount(){ touch "$RUN/mounted"; }
chown(){ :; }
install(){
  [[ "${FAIL_INSTALL:-0}" != 1 ]] || return 1
  cp "${@: -2:1}" "${@: -1}"
}
