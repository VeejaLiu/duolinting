#!/usr/bin/env python3
"""Fault-path checks for host maintenance; no network, Docker, secrets or email."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("maintenance", Path(__file__).with_name("certificate-maintenance.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CertificateMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.clock = 1800000000.0
        self.config = {"state_dir": self.temporary.name, "project_label": "Test", "proxy_container": "proxy", "cert_name": "example.test", "certbot_image": "sha256:test", "certificate_dir": "/certificates", "certbot_log_dir": "/logs"}
        self.manager = module.Maintenance(self.config, now=lambda: self.clock)
        self.manager.send = Mock(return_value="email-id")
        self.manager.state["last_renewal_success"] = self.clock

    def test_expiry_boundaries(self):
        for days, level in [(21.01, None), (21, "warning"), (14, "urgent"), (7, "critical"), (1, "emergency"), (-1, "emergency")]:
            with self.subTest(days=days):
                self.assertEqual(module.expiry_level(days), level)

    def test_failed_renewal_notifies_and_never_reloads_or_stops_proxy(self):
        commands = []
        def command(args, stage, **kwargs):
            commands.append(args)
            if stage == "acme-renew":
                raise module.MaintenanceError("acme-renew")
            return ""
        self.manager.command = command
        self.manager.reload = Mock()
        self.assertFalse(self.manager.renew())
        self.assertIn("renewal-failed", self.manager.state["issues"])
        self.manager.send.assert_called_once()
        self.manager.reload.assert_not_called()
        self.assertTrue(all(args[1] not in ["stop", "start", "restart", "compose"] for args in commands))
        self.assertNotIn("-p", commands[0])
        self.assertEqual(commands[-1][:3], ["docker", "rm", "-f"])

    def test_notification_retry_keeps_request_identity_and_deduplicates_after_restart(self):
        self.manager.send.side_effect = module.MaintenanceError("notification-delivery")
        self.manager.issue("renewal-failed", "failure")
        first_key = self.manager.send.call_args.args[2]
        self.clock += 3600
        other = module.Maintenance(self.config, now=lambda: self.clock)
        other.send = Mock(return_value="email-id")
        other.issue("renewal-failed", "failure updated")
        self.assertEqual(other.send.call_args.args[2], first_key)
        other.issue("renewal-failed", "same failure")
        other.send.assert_called_once()
        self.assertEqual(other.path.stat().st_mode & 0o077, 0)

    def test_escalation_and_recovery_notify_once(self):
        self.manager.issue("certificate-expiring", "21 days", "warning")
        self.manager.issue("certificate-expiring", "7 days", "critical")
        self.manager.clear("certificate-expiring")
        self.manager.clear("certificate-expiring")
        self.assertEqual(self.manager.send.call_count, 3)

    def test_recovery_send_failure_is_retried(self):
        self.manager.issue("renewal-failed", "failed")
        self.manager.send.side_effect = module.MaintenanceError("notification-delivery")
        self.manager.clear("renewal-failed")
        self.assertIn("renewal-failed", self.manager.state["issues"])
        self.manager.send.side_effect = None
        self.manager.clear("renewal-failed")
        self.assertNotIn("renewal-failed", self.manager.state["issues"])

    def healthy_certificate(self):
        self.manager.certificate = Mock(return_value={"days": 80, "expiry": self.clock + 80 * 86400})
        self.manager.served = Mock()

    def test_hourly_monitor_detects_missed_schedule(self):
        self.healthy_certificate()
        self.manager.state["last_renewal_success"] = self.clock - 28 * 3600
        self.assertFalse(self.manager.check())
        self.assertIn("renewal-scheduler-stale", self.manager.state["issues"])

    def test_disk_healthy_but_proxy_stale_notifies(self):
        self.healthy_certificate()
        self.manager.served.side_effect = module.MaintenanceError("served-certificate-mismatch")
        self.assertFalse(self.manager.check())
        self.assertIn("certificate-health", self.manager.state["issues"])

    def test_dry_run_exercises_reload_without_requesting_a_live_certificate(self):
        self.healthy_certificate()
        self.manager.command = Mock(return_value="")
        self.manager.reload = Mock()
        self.assertTrue(self.manager.renew("dry-run"))
        args = self.manager.command.call_args_list[0].args[0]
        self.assertIn("--dry-run", args)
        self.assertIn("--webroot", args)
        self.assertNotIn("--force-renewal", args)
        self.manager.reload.assert_called_once()

    def test_failed_nginx_validation_prevents_reload(self):
        commands = []
        def command(args, stage, **kwargs):
            commands.append(args)
            raise module.MaintenanceError(stage)
        self.manager.command = command
        with self.assertRaises(module.MaintenanceError):
            self.manager.reload()
        self.assertEqual(commands, [["docker", "exec", "proxy", "nginx", "-t"]])

    def test_noop_renewal_does_not_reload(self):
        self.healthy_certificate()
        self.manager.command = Mock(return_value="")
        self.manager.reload = Mock()
        self.assertTrue(self.manager.renew())
        self.manager.reload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
