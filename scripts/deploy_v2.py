#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_BRANCH = "feature/phase-2bc"
DEFAULT_SCOPE = "medora-beautys-projects"
DEFAULT_REMOTE_HOST = "44.253.141.97"
DEFAULT_REMOTE_USER = "ubuntu"
DEFAULT_REMOTE_DIR = "/opt/medora/medical-crm-v2"
DEFAULT_API_SERVICE = "medora-crm-v2-api"
DEFAULT_API_HEALTH_URL = "https://crmapi.medicaltourismchina.health/health"
RSYNC_EXCLUDES = (
    ".git",
    ".worktrees",
    ".vercel",
    ".turbo",
    ".next",
    "node_modules",
    "coverage",
    "dist",
    "BabelDOC",
    "dify",
    ".env",
    ".env.local",
)

ADMIN_REQUIRED_ENVS = (
    "API_URL",
    "ADMIN_ORIGIN",
    "HOSPITAL_ORIGIN",
    "SESSION_SECRET",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
    "KEYCLOAK_BASE_URL",
    "KEYCLOAK_REALM",
    "NEXT_PUBLIC_KEYCLOAK_URL",
    "NEXT_PUBLIC_KEYCLOAK_REALM",
    "NEXT_PUBLIC_KEYCLOAK_CLIENT_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "MAIN_SUPABASE_URL",
    "MAIN_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_HOSPITAL_PORTAL_LOGIN_URL",
)

HOSPITAL_REQUIRED_ENVS = (
    "API_URL",
    "ADMIN_ORIGIN",
    "HOSPITAL_ORIGIN",
    "SESSION_SECRET",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
    "KEYCLOAK_BASE_URL",
    "KEYCLOAK_REALM",
    "NEXT_PUBLIC_KEYCLOAK_URL",
    "NEXT_PUBLIC_KEYCLOAK_REALM",
    "NEXT_PUBLIC_KEYCLOAK_CLIENT_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)

API_REQUIRED_REMOTE_ENVS = (
    "DATABASE_URL",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
    "SESSION_SECRET",
    "ADMIN_ORIGIN",
    "HOSPITAL_ORIGIN",
    "API_URL",
    "PATIENT_JWT_SECRET",
)


@dataclass(frozen=True)
class FrontendTarget:
    name: str
    relative_dir: str
    required_envs: tuple[str, ...]


FRONTEND_TARGETS = {
    "admin": FrontendTarget(
        name="admin",
        relative_dir="apps/admin",
        required_envs=ADMIN_REQUIRED_ENVS,
    ),
    "hospital": FrontendTarget(
        name="hospital",
        relative_dir="apps/hospital",
        required_envs=HOSPITAL_REQUIRED_ENVS,
    ),
}


class CommandError(RuntimeError):
    pass


def print_header(message: str) -> None:
    print(f"\n==> {message}")


def run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    capture_output: bool = False,
    dry_run: bool = False,
) -> str:
    rendered = " ".join(shlex.quote(part) for part in cmd)
    prefix = f"[dry-run] " if dry_run else ""
    location = f" (cwd={cwd})" if cwd else ""
    print(f"{prefix}$ {rendered}{location}")
    if dry_run:
        return ""

    if not capture_output:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise CommandError(f"Command failed with exit code {completed.returncode}: {rendered}")
        return ""

    process = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    assert process.stdout is not None
    chunks: list[str] = []
    for line in process.stdout:
        sys.stdout.write(line)
        chunks.append(line)
    returncode = process.wait()
    output = "".join(chunks)
    if returncode != 0:
        raise CommandError(f"Command failed with exit code {returncode}: {rendered}")
    return output


def require_commands(commands: Iterable[str]) -> None:
    missing = [command for command in commands if shutil.which(command) is None]
    if missing:
        raise CommandError(f"Missing required commands: {', '.join(missing)}")


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parent.parent


def git_output(repo_root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repo_root, text=True).strip()


def current_branch(repo_root: Path) -> str:
    return git_output(repo_root, "rev-parse", "--abbrev-ref", "HEAD")


def ensure_clean_worktree(repo_root: Path) -> None:
    dirty = git_output(repo_root, "status", "--porcelain")
    if dirty:
        raise CommandError(
            "Working tree is dirty. Commit or stash changes first, or rerun with --allow-dirty."
        )


def ensure_branch_exists(repo_root: Path, branch: str) -> None:
    try:
        git_output(repo_root, "rev-parse", "--verify", branch)
    except subprocess.CalledProcessError as error:
        raise CommandError(f"Branch {branch!r} does not exist locally.") from error


def sanitize_branch(branch: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", branch)


class WorktreeContext:
    def __init__(self, repo_root: Path, branch: str, allow_dirty: bool, dry_run: bool) -> None:
        self.repo_root = repo_root
        self.branch = branch
        self.allow_dirty = allow_dirty
        self.dry_run = dry_run
        self.path = repo_root
        self._temp_dir: Path | None = None

    def __enter__(self) -> Path:
        active_branch = current_branch(self.repo_root)
        if active_branch == self.branch:
            if not self.allow_dirty:
                ensure_clean_worktree(self.repo_root)
            return self.path

        ensure_branch_exists(self.repo_root, self.branch)
        worktrees_dir = self.repo_root / ".worktrees"
        worktrees_dir.mkdir(exist_ok=True)
        self._temp_dir = Path(
            tempfile.mkdtemp(prefix=f"deploy-{sanitize_branch(self.branch)}-", dir=worktrees_dir)
        )
        print_header(f"Creating temporary worktree for {self.branch}")
        run(
            ["git", "worktree", "add", "--force", str(self._temp_dir), self.branch],
            cwd=self.repo_root,
            dry_run=self.dry_run,
        )
        self.path = self._temp_dir
        return self.path

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._temp_dir is None:
            return
        print_header(f"Removing temporary worktree {self._temp_dir}")
        try:
            run(
                ["git", "worktree", "remove", "--force", str(self._temp_dir)],
                cwd=self.repo_root,
                dry_run=self.dry_run,
            )
        finally:
            if self._temp_dir.exists():
                shutil.rmtree(self._temp_dir, ignore_errors=True)


def parse_targets(targets: str) -> list[str]:
    items = [item.strip() for item in targets.split(",") if item.strip()]
    expanded: list[str] = []
    for item in items:
        if item == "all":
            expanded.extend(["admin", "hospital", "api"])
        else:
            expanded.append(item)
    valid = {"admin", "hospital", "api"}
    unknown = [item for item in expanded if item not in valid]
    if unknown:
        raise CommandError(f"Unknown targets: {', '.join(sorted(set(unknown)))}")
    deduped: list[str] = []
    for item in expanded:
        if item not in deduped:
            deduped.append(item)
    return deduped


def parse_vercel_env_names(output: str) -> set[str]:
    return {
        match.group(1)
        for match in re.finditer(r"^\s*([A-Z0-9_]+)\s+Encrypted\s+Production", output, re.MULTILINE)
    }


def check_vercel_envs(project_dir: Path, scope: str, required_envs: Iterable[str], dry_run: bool) -> None:
    print_header(f"Checking Vercel production envs for {project_dir.name}")
    output = run(
        ["vercel", "env", "ls", "production", "--scope", scope],
        cwd=project_dir,
        capture_output=True,
        dry_run=dry_run,
    )
    if dry_run:
        return
    present = parse_vercel_env_names(output)
    missing = [env_name for env_name in required_envs if env_name not in present]
    if missing:
        raise CommandError(
            f"Missing Vercel envs for {project_dir.name}: {', '.join(missing)}"
        )


def parse_vercel_url(output: str) -> str:
    urls = re.findall(r"https://[A-Za-z0-9.-]+\.vercel\.app", output)
    if not urls:
        raise CommandError("Could not parse Vercel deployment URL from CLI output.")
    return urls[-1]


def deploy_frontend(
    repo_root: Path,
    target: FrontendTarget,
    scope: str,
    dry_run: bool,
) -> str:
    project_dir = repo_root / target.relative_dir
    check_vercel_envs(project_dir, scope, target.required_envs, dry_run)

    print_header(f"Deploying {target.name} to Vercel")
    output = run(
        ["vercel", "deploy", "--prod", "--yes", "--archive=tgz", "--scope", scope],
        cwd=project_dir,
        capture_output=True,
        dry_run=dry_run,
    )
    if dry_run:
        return f"https://{target.name}.example.vercel.app"
    return parse_vercel_url(output)


def ssh_base_command(args: argparse.Namespace) -> list[str]:
    command = ["ssh", "-o", "StrictHostKeyChecking=no"]
    if args.ssh_key:
        command.extend(["-i", args.ssh_key])
    command.append(f"{args.remote_user}@{args.remote_host}")
    return command


def rsync_ssh_command(args: argparse.Namespace) -> str:
    parts = ["ssh", "-o", "StrictHostKeyChecking=no"]
    if args.ssh_key:
        parts.extend(["-i", args.ssh_key])
    return " ".join(shlex.quote(part) for part in parts)


def check_remote_api_envs(args: argparse.Namespace, dry_run: bool) -> None:
    print_header("Checking remote API env file")
    remote_python = textwrap.dedent(
        f"""
        python3 - <<'PY'
from pathlib import Path
required = {list(API_REQUIRED_REMOTE_ENVS)!r}
env_path = Path({args.remote_dir!r}) / '.env'
if not env_path.exists():
    raise SystemExit('Missing remote env file: ' + str(env_path))
present = []
for raw in env_path.read_text().splitlines():
    raw = raw.strip()
    if not raw or raw.startswith('#') or '=' not in raw:
        continue
    present.append(raw.split('=', 1)[0])
missing = [name for name in required if name not in present]
if missing:
    raise SystemExit('Missing remote API env vars: ' + ', '.join(missing))
print('Remote API env check passed')
PY
        """
    ).strip()
    run(ssh_base_command(args) + [remote_python], dry_run=dry_run)


def deploy_api(repo_root: Path, args: argparse.Namespace) -> None:
    require_commands(["rsync"])
    check_remote_api_envs(args, args.dry_run)

    print_header("Syncing repository to the API server")
    rsync_command = [
        "rsync",
        "-az",
        "--delete",
    ]
    for exclude in RSYNC_EXCLUDES:
        rsync_command.extend(["--exclude", exclude])
    rsync_command.extend(["-e", rsync_ssh_command(args)])
    rsync_command.extend([f"{repo_root}/", f"{args.remote_user}@{args.remote_host}:{args.remote_dir}/"])
    run(rsync_command, dry_run=args.dry_run)

    print_header("Installing API dependencies and restarting the service")
    remote_restart = textwrap.dedent(
        f"""
        set -e
        cd {shlex.quote(args.remote_dir)}
        pnpm install --frozen-lockfile
        sudo systemctl restart {shlex.quote(args.api_service)}
        """
    ).strip()
    run(ssh_base_command(args) + [remote_restart], dry_run=args.dry_run)

    print_header("Waiting for API readiness")
    local_probe = textwrap.dedent(
        """
        set -e
        for i in $(seq 1 20); do
          if curl -fsS http://127.0.0.1:3001/health >/dev/null; then
            curl -fsS http://127.0.0.1:3001/health
            exit 0
          fi
          sleep 2
        done
        exit 1
        """
    ).strip()
    run(ssh_base_command(args) + [local_probe], dry_run=args.dry_run)

    print_header("Checking public API health endpoint")
    run(["curl", "-fsS", args.api_health_url], dry_run=args.dry_run)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deploy CRM v2 frontend apps and API.")
    parser.add_argument(
        "--targets",
        default="all",
        help="Comma-separated list of targets: admin,hospital,api or all.",
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH,
        help=f"Git branch to deploy. Defaults to {DEFAULT_BRANCH}.",
    )
    parser.add_argument("--scope", default=DEFAULT_SCOPE, help="Vercel scope/team.")
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Allow deploying the current checked-out branch even if the worktree is dirty.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing them.",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run preflight checks only, then exit.",
    )
    parser.add_argument("--ssh-key", help="Path to the SSH private key for the API server.")
    parser.add_argument("--remote-host", default=DEFAULT_REMOTE_HOST)
    parser.add_argument("--remote-user", default=DEFAULT_REMOTE_USER)
    parser.add_argument("--remote-dir", default=DEFAULT_REMOTE_DIR)
    parser.add_argument("--api-service", default=DEFAULT_API_SERVICE)
    parser.add_argument("--api-health-url", default=DEFAULT_API_HEALTH_URL)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    targets = parse_targets(args.targets)
    repo_root = repo_root_from_script()

    require_commands(["git", "pnpm", "python3"])
    if any(target in {"admin", "hospital"} for target in targets):
        require_commands(["vercel"])
    if "api" in targets:
        require_commands(["ssh", "curl"])
        if not args.ssh_key and not os.environ.get("DEPLOY_V2_SSH_KEY"):
            raise CommandError("--ssh-key is required when deploying the API.")
        if not args.ssh_key:
            args.ssh_key = os.environ["DEPLOY_V2_SSH_KEY"]
        args.ssh_key = str(Path(args.ssh_key).expanduser())
        if not Path(args.ssh_key).exists():
            raise CommandError(f"SSH key does not exist: {args.ssh_key}")

    print_header("Preflight checks")
    print(f"Repository root: {repo_root}")
    print(f"Targets: {', '.join(targets)}")
    print(f"Requested branch: {args.branch}")

    ensure_branch_exists(repo_root, args.branch)

    with WorktreeContext(repo_root, args.branch, args.allow_dirty, args.dry_run) as deploy_root:
        results: dict[str, str] = {}

        if args.validate:
            for target_name in targets:
                if target_name in FRONTEND_TARGETS:
                    target = FRONTEND_TARGETS[target_name]
                    check_vercel_envs(
                        deploy_root / target.relative_dir,
                        args.scope,
                        target.required_envs,
                        args.dry_run,
                    )
            if "api" in targets:
                check_remote_api_envs(args, args.dry_run)
            print_header("Validation complete")
            print("All requested preflight checks passed.")
            return 0

        for target_name in targets:
            if target_name in FRONTEND_TARGETS:
                target = FRONTEND_TARGETS[target_name]
                results[target_name] = deploy_frontend(
                    deploy_root,
                    target,
                    args.scope,
                    args.dry_run,
                )

        if "api" in targets:
            deploy_api(deploy_root, args)
            results["api"] = args.api_health_url

    print_header("Deployment complete")
    for target_name, location in results.items():
        print(f"{target_name}: {location}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CommandError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
