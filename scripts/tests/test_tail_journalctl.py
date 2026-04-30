import argparse
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "tail_journalctl.py"
SPEC = importlib.util.spec_from_file_location("tail_journalctl", SCRIPT_PATH)
assert SPEC is not None
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class TailJournalctlCommandTest(unittest.TestCase):
    def test_normalize_since_value_accepts_minutes_shorthand(self) -> None:
        self.assertEqual(MODULE.normalize_since_value("15"), "15 minutes ago")
        self.assertEqual(MODULE.normalize_since_value(" 30 "), "30 minutes ago")
        self.assertEqual(MODULE.normalize_since_value("2026-04-25 09:30:00"), "2026-04-25 09:30:00")

    def test_build_remote_command_with_follow_and_grep(self) -> None:
        args = argparse.Namespace(
            service="medora-crm-v2-api",
            lines=150,
            output="short-iso",
            since="15 minutes ago",
            until=None,
            priority="warning",
            grep="chatbot-v3",
            follow=True,
        )

        command = MODULE.build_remote_journalctl_command(args)

        self.assertIn("sudo journalctl -u medora-crm-v2-api", command)
        self.assertIn("--since '15 minutes ago'", command)
        self.assertIn("-p warning", command)
        self.assertIn("-f", command)
        self.assertIn("grep --line-buffered -i --color=always chatbot-v3", command)

    def test_normalize_args_uses_expanded_ssh_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            key_path = Path(temp_dir) / "lightsail.pem"
            key_path.write_text("dummy", encoding="utf-8")
            args = argparse.Namespace(
                ssh_key=str(key_path),
                lines=200,
                since="15",
            )

            normalized = MODULE.normalize_args(args)

            self.assertEqual(normalized.ssh_key, key_path)
            self.assertEqual(normalized.since, "15 minutes ago")


if __name__ == "__main__":
    unittest.main()
