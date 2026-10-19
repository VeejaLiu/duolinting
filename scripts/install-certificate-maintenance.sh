#!/usr/bin/env bash
# Run from the committed server-side source after preparing private JSON config.
# This installer never changes Compose services, database state or mail secrets.
set -Eeuo pipefail
if [[ $# -ne 1 || $EUID -ne 0 ]]; then
  printf 'Usage (as root): %s /absolute/path/to/private-config.json\n' "$0" >&2
  exit 2
fi
root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
config=$1
python3 - "$config" "$root_dir" <<'PY'
import ast
import json
from pathlib import Path
import sys

config_path = Path(sys.argv[1])
assert config_path.is_absolute() and config_path.stat().st_mode & 0o077 == 0, "Config must be private and absolute"
config = json.loads(config_path.read_text())
required = ["state_dir", "certificate_dir", "cert_name", "certbot_image", "certbot_log_dir", "proxy_container", "mail_env_file", "alert_email", "project_label", "log_file"]
assert all(isinstance(config.get(key), str) and config[key] for key in required), "Incomplete private configuration"
ast.parse((Path(sys.argv[2]) / "scripts/certificate-maintenance.py").read_text())
directory = Path(config["certificate_dir"]) / "acme-webroot/.well-known/acme-challenge"
directory.mkdir(parents=True, mode=0o755, exist_ok=True)
for path in [directory, directory.parent, directory.parent.parent]:
    path.chmod(0o755)
Path(config["state_dir"]).mkdir(parents=True, mode=0o700, exist_ok=True)
Path(config["certbot_log_dir"]).mkdir(parents=True, mode=0o750, exist_ok=True)
PY
certificate_dir=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["certificate_dir"])' "$config")
install -m 0644 "$root_dir/infra/nginx/acme-http-01.conf" "$certificate_dir/acme-http-01.conf"
install -m 0750 "$root_dir/scripts/certificate-maintenance.py" /usr/local/sbin/duolinting-certificate-maintenance
# Retain the old entry point for existing operator habits, but route it through
# the new webroot implementation. There is no standalone/stop-proxy fallback.
printf '#!/bin/sh\noperation=renew\nif [ "${1:-}" = --dry-run ]; then operation=dry-run; shift; fi\nexec /usr/local/sbin/duolinting-certificate-maintenance "$operation" --config %s "$@"\n' "$(printf '%q' "$config")" > /usr/local/sbin/duolinting-renew-certificates
chmod 0750 /usr/local/sbin/duolinting-renew-certificates
cat > /etc/cron.d/duolinting-certificates <<CRON
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
# Times use the host timezone. The independent systemd timer checks for missed runs.
17 3,15 * * * root /usr/local/sbin/duolinting-certificate-maintenance renew --config $config >> /var/log/letsencrypt/duolinting-maintenance.log 2>&1
CRON
chmod 0644 /etc/cron.d/duolinting-certificates
cat > /etc/systemd/system/duolinting-certificate-monitor.service <<UNIT
[Unit]
Description=Check certificate expiry, loaded certificates and renewal liveness
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/duolinting-certificate-maintenance check --config $config
TimeoutStartSec=180
UMask=0077
UNIT
cat > /etc/systemd/system/duolinting-certificate-monitor.timer <<'UNIT'
[Unit]
Description=Independent hourly certificate monitor

[Timer]
OnCalendar=hourly
RandomizedDelaySec=120
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now duolinting-certificate-monitor.timer
cat > /etc/logrotate.d/duolinting-certificates <<'LOGROTATE'
/var/log/letsencrypt/duolinting-renewal.log /var/log/letsencrypt/duolinting-maintenance.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
LOGROTATE
printf 'Certificate maintenance installed. Validate nginx and reconfigure Certbot before relying on the schedule.\n'
