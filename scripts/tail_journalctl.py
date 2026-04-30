#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path


DEFAULT_REMOTE_HOST = "44.253.141.97"
DEFAULT_REMOTE_USER = "ubuntu"
DEFAULT_SERVICE = "medora-crm-v2-api"
DEFAULT_LINES = 200


class CommandError(RuntimeError):
    pass


def normalize_since_value(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if normalized.isdigit():
        return f"{int(normalized)} minutes ago"
    return normalized


def build_remote_journalctl_command(args: argparse.Namespace) -> str:
    parts = [
        "sudo",
        "journalctl",
        "-u",
        args.service,
        "--no-pager",
        "-n",
        str(args.lines),
        "-o",
        args.output,
    ]

    if args.since:
        parts.extend(["--since", args.since])
    if args.until:
        parts.extend(["--until", args.until])
    if args.priority:
        parts.extend(["-p", args.priority])
    if args.follow:
        parts.append("-f")

    command = " ".join(shlex.quote(part) for part in parts)
    if args.grep:
        command = f"{command} | grep --line-buffered -i --color=always {shlex.quote(args.grep)}"
    return command


def build_ssh_command(args: argparse.Namespace, remote_command: str) -> list[str]:
    command = [
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-t" if args.follow else "-T",
    ]
    if args.ssh_key:
        command.extend(["-i", str(args.ssh_key)])
    command.append(f"{args.remote_user}@{args.remote_host}")
    command.append(remote_command)
    return command


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SSH into the CRM Lightsail server and tail journalctl logs.",
    )
    parser.add_argument(
        "--ssh-key",
        default=None,
        help="Path to the SSH private key. Falls back to DEPLOY_V2_SSH_KEY if omitted.",
    )
    parser.add_argument(
        "--remote-host",
        default=DEFAULT_REMOTE_HOST,
        help=f"Remote API host. Defaults to {DEFAULT_REMOTE_HOST}.",
    )
    parser.add_argument(
        "--remote-user",
        default=DEFAULT_REMOTE_USER,
        help=f"Remote SSH user. Defaults to {DEFAULT_REMOTE_USER}.",
    )
    parser.add_argument(
        "--service",
        default=DEFAULT_SERVICE,
        help=f"systemd service name. Defaults to {DEFAULT_SERVICE}.",
    )
    parser.add_argument(
        "--lines",
        type=int,
        default=DEFAULT_LINES,
        help=f"How many recent lines to print first. Defaults to {DEFAULT_LINES}.",
    )
    parser.add_argument(
        "--since",
        help='Optional journalctl --since value, for example "15 minutes ago".',
    )
    parser.add_argument(
        "--until",
        help='Optional journalctl --until value, for example "2026-04-25 09:30:00".',
    )
    parser.add_argument(
        "--priority",
        help='Optional journal priority filter, for example "warning" or "err".',
    )
    parser.add_argument(
        "--output",
        default="short-iso",
        help='journalctl output format. Defaults to "short-iso".',
    )
    parser.add_argument(
        "--grep",
        help="Optional case-insensitive grep filter applied on the remote host.",
    )
    parser.add_argument(
        "--follow",
        action="store_true",
        help="Keep streaming logs until interrupted.",
    )
    parser.add_argument(
        "--print-command",
        action="store_true",
        help="Print the resolved ssh command before executing it.",
    )
    return parser.parse_args()


def normalize_args(args: argparse.Namespace) -> argparse.Namespace:
    if args.ssh_key:
        args.ssh_key = Path(args.ssh_key).expanduser()
    else:
        env_value = os.environ.get("DEPLOY_V2_SSH_KEY")
        args.ssh_key = Path(env_value).expanduser() if env_value else None

    if not args.ssh_key:
        raise CommandError("--ssh-key is required unless DEPLOY_V2_SSH_KEY is set.")
    if not args.ssh_key.exists():
        raise CommandError(f"SSH key does not exist: {args.ssh_key}")
    if args.lines < 0:
        raise CommandError("--lines must be >= 0.")
    args.since = normalize_since_value(args.since)
    return args


def main() -> int:
    try:
        args = normalize_args(parse_args())
        remote_command = build_remote_journalctl_command(args)
        command = build_ssh_command(args, remote_command)

        if args.print_command:
            print("Resolved command:")
            print(" ".join(shlex.quote(part) for part in command))

        result = subprocess.run(command, check=False)
        return result.returncode
    except CommandError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
