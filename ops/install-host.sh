#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" = 0 || fail "run this installer with sudo"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${KAMELOG_APP_DIR:-$(dirname "$SCRIPT_DIR")}"
SERVICE_USER="${KAMELOG_SERVICE_USER:-${SUDO_USER:-}}"
test "$SERVICE_USER" && test "$SERVICE_USER" != root || fail "could not determine the non-root service user"
id "$SERVICE_USER" >/dev/null 2>&1 || fail "unknown service user: $SERVICE_USER"

USER_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
ENV_FILE="${KAMELOG_ENV_FILE:-$APP_DIR/.env}"
BACKUP_ROOT="${KAMELOG_BACKUP_ROOT:-$USER_HOME/backups/kamelog}"
STATE_DIR="${KAMELOG_DEPLOY_STATE_DIR:-$USER_HOME/.local/state/kamelog-deploy}"
NODE_BIN="${KAMELOG_NODE_BIN:-}"

test -d "$APP_DIR/.git" || fail "not a Git checkout: $APP_DIR"
test -r "$ENV_FILE" || fail "create $ENV_FILE before installing"
test "$NODE_BIN" && test -x "$NODE_BIN" || fail 'pass the shell Node path: sudo env KAMELOG_NODE_BIN="$(command -v node)" ./ops/install-host.sh'
id -nG "$SERVICE_USER" | tr ' ' '\n' | grep -qx docker || fail "$SERVICE_USER must belong to the docker group"

ensure_inference_encryption_key() {
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?KAMELOG_INFERENCE_ENCRYPTION_KEY=[^[:space:]#]+' "$ENV_FILE"; then
    return
  fi
  command -v openssl >/dev/null 2>&1 || fail "openssl is required to initialize the inference encryption key"
  local key
  key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  test "${#key}" = 43 || fail "could not generate a 32 byte inference encryption key"
  local generated_env
  generated_env="$(mktemp "$(dirname "$ENV_FILE")/.kamelog-env.XXXXXX")"
  {
    cat "$ENV_FILE"
    printf '\nKAMELOG_INFERENCE_ENCRYPTION_KEY=%s\n' "$key"
  } >"$generated_env"
  chown --reference="$ENV_FILE" "$generated_env"
  chmod --reference="$ENV_FILE" "$generated_env"
  mv -f -- "$generated_env" "$ENV_FILE"
  printf 'initialized KAMELOG_INFERENCE_ENCRYPTION_KEY in %s\n' "$ENV_FILE"
}

ensure_inference_encryption_key

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$BACKUP_ROOT" "$STATE_DIR"
install -o root -g root -m 0755 "$APP_DIR/ops/kamelog-update" /usr/local/sbin/kamelog-update

temporary="$(mktemp -d)"
trap 'rm -rf -- "$temporary"' EXIT

for unit in kamelog.service kamelog-update.service kamelog-update.timer kamelog-auto-tag.service kamelog-auto-tag.timer kamelog-auto-thread.service kamelog-auto-thread.timer; do
  sed \
    -e "s|User=kamelog|User=$SERVICE_USER|" \
    -e "s|Group=kamelog|Group=$SERVICE_USER|" \
    -e "s|/srv/kamelog|$APP_DIR|g" \
    -e "s|/etc/kamelog/env|$ENV_FILE|g" \
    "$APP_DIR/ops/systemd/$unit" >"$temporary/$unit"
  install -o root -g root -m 0644 "$temporary/$unit" "/etc/systemd/system/$unit"
done

install -d -o root -g root -m 0755 /etc/systemd/system/kamelog-update.service.d
cat >"$temporary/host.conf" <<EOF
[Service]
Environment="PATH=$(dirname "$NODE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="KAMELOG_APP_DIR=$APP_DIR"
Environment="KAMELOG_ENV_FILE=$ENV_FILE"
Environment="KAMELOG_BACKUP_ROOT=$BACKUP_ROOT"
Environment="KAMELOG_DEPLOY_STATE_DIR=$STATE_DIR"
EOF
install -o root -g root -m 0644 "$temporary/host.conf" /etc/systemd/system/kamelog-update.service.d/host.conf
rm -f /etc/systemd/system/kamelog-update.service.d/path.conf

systemctl daemon-reload
systemctl enable --now kamelog.service kamelog-update.timer kamelog-auto-tag.timer kamelog-auto-thread.timer
systemctl reset-failed kamelog-update.service
systemctl start kamelog-update.service

printf 'kamelog host installation completed\n'
systemctl --no-pager --full status kamelog.service kamelog-update.timer || true
