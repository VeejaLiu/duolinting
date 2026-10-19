#!/usr/bin/env python3
"""Host-side ACME renewal and email alerts; uses only the Python standard library.

Deployment-specific values belong in a root-readable JSON config, never here.
Certificate material, mail credentials and raw command output are never emailed.
"""

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shlex
import signal
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


class MaintenanceError(Exception):
    """A fixed stage name, safe to put in logs and notifications."""


def expiry_level(days):
    """Days are fractional UTC seconds / 86400; thresholds include their boundary."""
    for threshold, level in [(1, "emergency"), (7, "critical"), (14, "urgent"), (21, "warning")]:
        if days <= threshold:
            return level
    return None


class Maintenance:
    def __init__(self, config, now=time.time):
        self.config = config
        self.now = now
        self.directory = Path(config["state_dir"])
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path = self.directory / "health.json"
        # Schema 1: epoch values are UTC seconds. Issues retain incident IDs and
        # successful delivery times, so retries survive process/host restarts.
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {"schema": 1, "issues": {}}
        self.notification_failed = False

    def save(self):
        pending = self.path.with_suffix(".next")
        pending.write_text(json.dumps(self.state, indent=2) + "\n")
        pending.chmod(0o600)
        os.replace(pending, self.path)

    def command(self, args, stage, timeout=20, log=False):
        """Command diagnostics stay on the host; exceptions contain only a stage."""
        try:
            if log:
                with open(self.config["log_file"], "a") as stream:
                    result = subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout)
                output = ""
            else:
                result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
                output = result.stdout
        except (OSError, subprocess.TimeoutExpired):
            raise MaintenanceError(stage) from None
        if result.returncode:
            raise MaintenanceError(stage)
        return output

    def certificate(self):
        path = Path(self.config["certificate_dir"]) / "live" / self.config["cert_name"] / "fullchain.pem"
        output = self.command(["openssl", "x509", "-in", str(path), "-noout", "-enddate", "-fingerprint", "-sha256", "-ext", "subjectAltName"], "certificate-read")
        try:
            end = re.search(r"^notAfter=(.+)$", output, re.M).group(1)
            expiry = dt.datetime.strptime(end, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=dt.timezone.utc).timestamp()
            fingerprint = re.search(r"Fingerprint=([A-Fa-f0-9:]+)", output).group(1).replace(":", "").lower()
            hosts = re.findall(r"DNS:([A-Za-z0-9.*-]+)", output)
            if not hosts or any("*" in host for host in hosts):
                raise ValueError()
        except (ValueError, AttributeError):
            raise MaintenanceError("certificate-metadata") from None
        return {"expiry": expiry, "days": (expiry - self.now()) / 86400, "fingerprint": fingerprint, "hosts": hosts}

    def served(self, certificate):
        """Check the origin itself with SNI + public CA trust, bypassing the CDN.

        Disk checks alone miss a proxy that never loaded the renewed certificate.
        Every SAN must serve the exact leaf certificate installed on disk.
        """
        context = ssl.create_default_context()
        for host in certificate["hosts"]:
            try:
                with socket.create_connection((self.config.get("tls_address", "127.0.0.1"), self.config.get("tls_port", 443)), timeout=5) as raw:
                    with context.wrap_socket(raw, server_hostname=host) as connection:
                        fingerprint = hashlib.sha256(connection.getpeercert(binary_form=True)).hexdigest()
                if fingerprint != certificate["fingerprint"]:
                    raise MaintenanceError("served-certificate-mismatch")
            except (OSError, ssl.SSLError):
                raise MaintenanceError("origin-tls-validation") from None

    def reload(self):
        proxy = self.config["proxy_container"]
        # nginx -t must pass first. A HUP gracefully starts new workers and lets
        # existing connections finish; this never stops/recreates the container.
        self.command(["docker", "exec", proxy, "nginx", "-t"], "proxy-config-validation", log=True)
        self.command(["docker", "exec", proxy, "nginx", "-s", "reload"], "proxy-reload", log=True)
        last_error = None
        for delay in (0, 1, 2):
            time.sleep(delay)
            try:
                self.served(self.certificate())
                return
            except MaintenanceError as error:
                last_error = error
        raise last_error

    def mail_settings(self):
        values = {}
        # Read only the three existing transactional-email values. shlex handles
        # quoted dotenv strings without evaluating shell commands or expansions.
        for line in Path(self.config["mail_env_file"]).read_text().splitlines():
            match = re.match(r"^(?:export\s+)?(RESEND_API_KEY|RESEND_FROM_EMAIL|RESEND_FROM_NAME)=(.*)$", line)
            if match:
                parts = shlex.split(match.group(2), comments=True)
                values[match.group(1)] = " ".join(parts)
        if not values.get("RESEND_API_KEY") or not values.get("RESEND_FROM_EMAIL"):
            raise MaintenanceError("notification-credentials")
        return values

    def mail_request(self, path, method="GET", payload=None, key=None):
        settings = self.mail_settings()
        headers = {"Authorization": "Bearer " + settings["RESEND_API_KEY"], "Content-Type": "application/json", "User-Agent": "CertificateMaintenance/1"}
        if key:
            headers["Idempotency-Key"] = key
        request = urllib.request.Request("https://api.resend.com" + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.load(response)
        except (OSError, ValueError):
            raise MaintenanceError("notification-delivery") from None

    def send(self, subject, message, key):
        settings = self.mail_settings()
        sender = settings.get("RESEND_FROM_NAME", self.config["project_label"]) + " <" + settings["RESEND_FROM_EMAIL"] + ">"
        response = self.mail_request("/emails", "POST", {"from": sender, "to": [self.config["alert_email"]], "subject": subject, "text": message}, key)
        if not response.get("id"):
            raise MaintenanceError("notification-response")
        return response["id"]

    def issue(self, code, detail, level="critical"):
        now = self.now()
        issue = self.state["issues"].setdefault(code, {"incident": uuid.uuid4().hex, "first_seen": now, "notified_at": 0})
        changed = issue.get("level") != level
        issue.update({"detail": detail, "level": level, "last_seen": now, "resolved": False})
        # Notify immediately, on escalation, and at most once per 24 hours for an
        # unchanged incident. A failed send does not consume the retry window.
        if not issue["notified_at"] or changed or now - issue["notified_at"] >= 86400:
            # Persist a stable request identity before transmission. If the mail
            # provider accepted it but the reply was lost, its idempotency key
            # suppresses a duplicate on the next hourly retry (within 24 hours).
            signature = level + ":" + str(int(now // 86400))
            pending = issue.get("pending")
            if not pending or pending["signature"] != signature:
                pending = {"signature": signature, "key": "certificate-" + uuid.uuid4().hex, "detail": detail}
                issue["pending"] = pending
            self.save()
            try:
                subject = "[" + self.config["project_label"] + "] HTTPS 证书告警 / " + code
                issue["email_id"] = self.send(subject, pending["detail"] + "\n\n严重程度：" + level + "\n请检查服务器上的证书维护日志。", pending["key"])
                issue["notified_at"] = now
                issue.pop("pending", None)
            except (MaintenanceError, OSError, ValueError):
                self.notification_failed = True
                print("NOTIFICATION_FAILED " + code, file=sys.stderr)
        self.save()

    def clear(self, code):
        issue = self.state["issues"].get(code)
        if not issue:
            return
        if issue["notified_at"]:
            issue["resolved"] = True
            self.save()
            try:
                self.send("[" + self.config["project_label"] + "] HTTPS 证书告警已恢复 / " + code, "此前的证书告警已恢复：" + code, "certificate-recovered-" + issue["incident"])
            except (MaintenanceError, OSError, ValueError):
                self.notification_failed = True
                return
        del self.state["issues"][code]
        self.save()

    def check(self):
        self.state["last_monitor_check"] = self.now()
        healthy = True
        try:
            certificate = self.certificate()
            level = expiry_level(certificate["days"])
            if level:
                healthy = False
                expiry = dt.datetime.fromtimestamp(certificate["expiry"], dt.timezone.utc).isoformat()
                self.issue("certificate-expiring", "证书剩余有效期约 " + str(math.floor(certificate["days"])) + " 天；到期时间（UTC）：" + expiry, level)
            else:
                self.clear("certificate-expiring")
            self.served(certificate)
            self.clear("certificate-health")
        except MaintenanceError as error:
            healthy = False
            self.issue("certificate-health", "源站证书检查失败，阶段：" + str(error))
        last = self.state.get("last_renewal_success", 0)
        if self.now() - last > 27 * 3600:
            healthy = False
            self.issue("renewal-scheduler-stale", "自动续期已超过 27 小时没有完成一次成功检查。")
        else:
            self.clear("renewal-scheduler-stale")
        # Renewal failures remain active until the same renewal path succeeds.
        # Retry delivery hourly even when the next renewal attempt is hours away.
        for code in ("renewal-failed",):
            issue = self.state["issues"].get(code)
            if issue and issue.get("resolved"):
                self.clear(code)
            elif issue:
                healthy = False
                self.issue(code, issue["detail"], issue["level"])
        if healthy:
            self.clear("monitor-failed")
        self.save()
        return healthy and not self.notification_failed

    def renew(self, operation="renew"):
        self.state["last_renewal_attempt"] = self.now()
        self.save()
        name = self.config.get("renewal_container", "duolinting-certbot-scheduled")
        certificate_dir = self.config["certificate_dir"]
        try:
            args = ["docker", "run", "--rm", "--name", name, "-v", certificate_dir + ":/etc/letsencrypt", "-v", certificate_dir + "/acme-webroot:/var/www/acme", "-v", self.config["certbot_log_dir"] + ":/var/log/letsencrypt", self.config["certbot_image"], "reconfigure" if operation == "reconfigure" else "renew", "--cert-name", self.config["cert_name"], "--webroot", "--webroot-path", "/var/www/acme", "--non-interactive", "--no-random-sleep-on-renew", "--no-directory-hooks"]
            if operation == "dry-run":
                args.append("--dry-run")
            # Certbot decides readiness from certificate lifetime/ACME renewal
            # information. Do not bake a fixed 90-day lifetime into automation.
            self.command(args, "acme-" + operation, timeout=240, log=True)
            certificate = self.certificate()
            try:
                self.served(certificate)
                needs_reload = operation != "renew"
            except MaintenanceError:
                needs_reload = True
            if needs_reload:
                self.reload()
            self.state["last_renewal_success"] = self.now()
            self.save()
            self.clear("renewal-failed")
        except MaintenanceError as error:
            self.issue("renewal-failed", "自动续期或证书加载失败，阶段：" + str(error))
            return False
        finally:
            # Only the ephemeral challenge container may be removed. The proxy
            # and all application/data containers remain running on every path.
            with contextlib.suppress(MaintenanceError):
                self.command(["docker", "rm", "-f", name], "challenge-cleanup", timeout=15)
        return self.check()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["renew", "check", "dry-run", "reconfigure", "test-alert", "delivery-status", "status"])
    parser.add_argument("--config", default="/etc/duolinting/certificate-maintenance.json")
    parser.add_argument("--email-id")
    args = parser.parse_args()
    os.umask(0o077)
    maintenance = None
    try:
        config_path = Path(args.config)
        # Configuration contains the recipient and the path to existing secrets;
        # neither should be readable/writable by other host users.
        if config_path.stat().st_mode & 0o077:
            raise MaintenanceError("private-config-permissions")
        config = json.loads(config_path.read_text())
        directory = Path(config["state_dir"])
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        with open(directory / "maintenance.lock", "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("MAINTENANCE_ALREADY_RUNNING")
                return 0
            maintenance = Maintenance(config)
            if args.operation == "status":
                print(json.dumps(maintenance.state, indent=2))
                return 0
            if args.operation == "delivery-status":
                if not args.email_id or not re.fullmatch(r"[A-Fa-f0-9-]{36}", args.email_id):
                    raise MaintenanceError("email-id-required")
                result = maintenance.mail_request("/emails/" + args.email_id)
                print(json.dumps({"id": result.get("id"), "last_event": result.get("last_event")}))
                return 0
            if args.operation == "test-alert":
                email_id = maintenance.send("[" + config["project_label"] + "] HTTPS 证书告警测试", "这是一封证书维护告警的测试邮件。\n\n续期失败、证书临近到期、证书未加载或定时任务漏跑时，将通过此邮箱通知你。\n本次测试不表示线上出现故障，无需操作。", "certificate-test-" + uuid.uuid4().hex)
                print(json.dumps({"test_email_id": email_id}))
                return 0
            signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(MaintenanceError("interrupted")))
            signal.signal(signal.SIGINT, lambda *_: (_ for _ in ()).throw(MaintenanceError("interrupted")))
            result = maintenance.check() if args.operation == "check" else maintenance.renew(args.operation)
            print("MAINTENANCE_OK" if result else "MAINTENANCE_REQUIRES_ATTENTION")
            return 0 if result else 1
    except Exception as error:
        # Avoid leaking exception bodies containing credential values or URLs.
        stage = str(error) if isinstance(error, MaintenanceError) else type(error).__name__
        print("MAINTENANCE_FAILED " + stage, file=sys.stderr)
        if maintenance:
            with contextlib.suppress(Exception):
                maintenance.issue("monitor-failed", "证书维护程序异常，阶段：" + stage)
        return 1


if __name__ == "__main__":
    sys.exit(main())
