#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any


DEFAULT_REMOTE_HOST = "44.253.141.97"
DEFAULT_REMOTE_USER = "ubuntu"
DEFAULT_REMOTE_CRM_ENV_PATH = "/opt/medora/medical-crm-v2/.env"
DEFAULT_REMOTE_DIFY_DIR = "/opt/medora/dify/docker"
DEFAULT_CRM_BASE_URL = "https://crmapi.medicaltourismchina.health"
DEFAULT_DIFY_BASE_URL = "https://ai.medicaltourismchina.health/v1"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_APP_USER = "ops-diagnostic"


class CommandError(RuntimeError):
    pass


@dataclass
class HttpResult:
    status: int
    content_type: str
    text: str
    json_body: Any | None
    set_cookie_headers: list[str]


def print_section(title: str) -> None:
    print(f"\n==> {title}")


def print_json(label: str, payload: Any) -> None:
    print(f"{label}: {json.dumps(payload, ensure_ascii=False, indent=2)}")


def mask_secret(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return ""
    if len(trimmed) <= 10:
        return "*" * len(trimmed)
    return f"{trimmed[:6]}...{trimmed[-4:]}"


def preview_text(text: str, limit: int = 240) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1] + "…"


def http_request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> HttpResult:
    encoded_body = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded_body,
        headers=headers or {},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            content_type = response.headers.get("Content-Type", "")
            return HttpResult(
                status=response.status,
                content_type=content_type,
                text=raw,
                json_body=parse_json_maybe(raw, content_type),
                set_cookie_headers=response.headers.get_all("Set-Cookie") or [],
            )
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        content_type = error.headers.get("Content-Type", "")
        return HttpResult(
            status=error.code,
            content_type=content_type,
            text=raw,
            json_body=parse_json_maybe(raw, content_type),
            set_cookie_headers=error.headers.get_all("Set-Cookie") or [],
        )


def parse_json_maybe(raw: str, content_type: str) -> Any | None:
    if "json" not in content_type.lower():
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def build_cookie_header(set_cookie_headers: list[str]) -> str:
    cookie_parts = [value.split(";", 1)[0] for value in set_cookie_headers if value.startswith("patient_")]
    return "; ".join(cookie_parts)


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise CommandError(message)


def run_ssh(
    *,
    host: str,
    user: str,
    ssh_key: str,
    script: str,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    command = [
        "ssh",
        "-i",
        ssh_key,
        "-o",
        "BatchMode=yes",
        f"{user}@{host}",
        script,
    ]
    process = subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if process.returncode != 0:
        raise CommandError(
            f"SSH command failed ({process.returncode}): {' '.join(shlex.quote(part) for part in command)}\n"
            f"{process.stderr.strip()}"
        )
    return process.stdout.strip()


def remote_python_script(code: str, *args: str) -> str:
    argv = " ".join(shlex.quote(arg) for arg in args)
    suffix = f" {argv}" if argv else ""
    return f"python3 -{suffix} <<'PY'\n{code}\nPY"


def run_dify_chat_check(base_url: str, app_key: str, message: str, user: str, timeout: int) -> dict[str, Any]:
    return run_dify_chat_check_with_inputs(
        base_url=base_url,
        app_key=app_key,
        message=message,
        user=user,
        inputs={"hospitalType": "REGULAR"},
        timeout=timeout,
    )


def parse_inputs_json(raw: str | None) -> dict[str, Any]:
    if raw is None:
        return {"hospitalType": "REGULAR"}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise CommandError(f"Invalid --inputs-json value: {error}") from error
    if not isinstance(parsed, dict):
        raise CommandError("--inputs-json must decode to a JSON object.")
    return parsed


def run_dify_chat_check_with_inputs(
    *,
    base_url: str,
    app_key: str,
    message: str,
    user: str,
    inputs: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    result = http_request_json(
        f"{base_url.rstrip('/')}/chat-messages",
        method="POST",
        headers={
            "Authorization": f"Bearer {app_key}",
            "Content-Type": "application/json",
        },
        body={
            "inputs": inputs,
            "query": message,
            "response_mode": "blocking",
            "conversation_id": "",
            "user": user,
        },
        timeout=timeout,
    )

    payload: dict[str, Any] = {
        "status": result.status,
        "contentType": result.content_type,
        "bodyPreview": preview_text(result.text),
    }
    if isinstance(result.json_body, dict):
        payload["jsonKeys"] = sorted(result.json_body.keys())
        if "answer" in result.json_body:
            payload["answerPreview"] = preview_text(str(result.json_body.get("answer", "")))
        if "message" in result.json_body:
            payload["message"] = result.json_body.get("message")
        if "code" in result.json_body:
            payload["code"] = result.json_body.get("code")
    payload["diagnosis"] = diagnose_dify_response(result)
    return payload


def diagnose_dify_response(result: HttpResult) -> str:
    lowered_body = result.text.lower()
    return diagnose_dify_status(result.status, lowered_body)


def diagnose_dify_status(status: int, lowered_body: str) -> str:
    if status == 401:
        return "Dify app key is invalid for this instance, or CRM is pointed at the wrong Dify deployment."
    if status == 400 and "required in input form" in lowered_body:
        return "Dify is reachable and the app key is accepted, but the workflow requires CRM-provided inputs such as sessionId or hospitalType."
    if status == 502 and "bad gateway" in lowered_body:
        return "Public Dify is returning nginx/edge 502. Check Dify nginx upstreams and restart nginx if api container IP changed."
    if status >= 500 and "sandbox" in lowered_body and "401" in lowered_body:
        return "Code execution sandbox rejected the request. Compare CODE_EXECUTION_API_KEY and SANDBOX_API_KEY."
    if status >= 500:
        return "Dify is reachable but failed server-side. Inspect api, worker, and sandbox logs."
    if status == 200:
        return "Dify public chat endpoint responded successfully."
    return "Review the raw response preview."


def run_crm_smoke(
    *,
    crm_base_url: str,
    name: str,
    email: str,
    phone: str,
    gender: str,
    country: str,
    department: str,
    department_code: str,
    disease: str,
    destination: str,
    treatment_time: str,
    chat_message: str,
    timeout: int,
) -> dict[str, Any]:
    onboarding = http_request_json(
        f"{crm_base_url.rstrip('/')}/api/patient/onboarding/init",
        method="POST",
        headers={"Content-Type": "application/json"},
        body={
            "name": name,
            "email": email,
            "phone": phone,
            "gender": gender,
            "country": country,
            "department": department,
            "departmentCode": department_code,
            "disease": disease,
            "destination": destination,
            "treatmentTime": treatment_time,
        },
        timeout=timeout,
    )
    ensure(onboarding.status == 200, f"Onboarding failed with status {onboarding.status}: {preview_text(onboarding.text)}")
    ensure(isinstance(onboarding.json_body, dict), "Onboarding response was not JSON.")

    onboarding_body = onboarding.json_body
    cookie_header = build_cookie_header(onboarding.set_cookie_headers)
    session_id = (
        onboarding_body.get("widgetChatTarget", {}) or {}
    ).get("sessionId")
    ensure(session_id, "Onboarding did not return widgetChatTarget.sessionId.")

    history = http_request_json(
        f"{crm_base_url.rstrip('/')}/api/v2/chatbot/history/{session_id}?limit=50",
        headers={"Cookie": cookie_header},
        timeout=timeout,
    )
    ensure(history.status == 200, f"History failed with status {history.status}: {preview_text(history.text)}")
    ensure(isinstance(history.json_body, dict), "History response was not JSON.")
    history_body = history.json_body
    messages = history_body.get("messages", []) if isinstance(history_body, dict) else []
    first_message = messages[0] if messages else {}
    first_blocks = [block.get("type") for block in first_message.get("blocks", []) or []] if isinstance(first_message, dict) else []

    chat = http_request_json(
        f"{crm_base_url.rstrip('/')}/api/v2/chatbot/chat",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Cookie": cookie_header,
        },
        body={
            "sessionId": session_id,
            "message": chat_message,
        },
        timeout=max(timeout, 120),
    )
    ensure(chat.status == 200, f"Chat failed with status {chat.status}: {preview_text(chat.text)}")
    ensure(isinstance(chat.json_body, dict), "Chat response was not JSON.")
    chat_body = chat.json_body

    return {
        "onboarding": {
            "nextStep": onboarding_body.get("nextStep"),
            "widgetChatTarget": onboarding_body.get("widgetChatTarget"),
            "patientCookies": len([cookie for cookie in onboarding.set_cookie_headers if cookie.startswith("patient_")]),
        },
        "history": {
            "messageCount": len(messages),
            "firstMessagePreview": preview_text(str(first_message.get("content", ""))) if isinstance(first_message, dict) else None,
            "firstBlocks": first_blocks,
        },
        "chat": {
            "intent": chat_body.get("intent"),
            "nextAction": chat_body.get("nextAction"),
            "answerPreview": preview_text(str(chat_body.get("answer", ""))),
        },
    }


def remote_load_env(path_name: str) -> str:
    return textwrap.dedent(
        """
        import json, sys
        from pathlib import Path

        def parse_env(path: Path) -> dict[str, str]:
            data = {}
            if not path.exists():
                return data
            for raw_line in path.read_text().splitlines():
                line = raw_line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('export '):
                    line = line[len('export '):]
                if '=' not in line:
                    continue
                key, value = line.split('=', 1)
                data[key.strip()] = value.strip().strip('"').strip("'")
            return data

        env = parse_env(Path(sys.argv[1]))
        print(json.dumps(env))
        """
    ).strip()


def run_remote_check(
    *,
    host: str,
    user: str,
    ssh_key: str,
    crm_env_path: str,
    dify_dir: str,
    timeout: int,
) -> dict[str, Any]:
    crm_env_raw = run_ssh(
        host=host,
        user=user,
        ssh_key=ssh_key,
        timeout=timeout,
        script=remote_python_script(remote_load_env("crm_env"), crm_env_path),
    )
    crm_env = json.loads(crm_env_raw)

    dify_env_raw = run_ssh(
        host=host,
        user=user,
        ssh_key=ssh_key,
        timeout=timeout,
        script=remote_python_script(remote_load_env("dify_env"), f"{dify_dir}/.env"),
    )
    dify_env = json.loads(dify_env_raw)

    ps_output = run_ssh(
        host=host,
        user=user,
        ssh_key=ssh_key,
        timeout=timeout,
        script=f"cd {shlex.quote(dify_dir)} && sudo docker compose ps",
    )

    remote_public_chat_script = textwrap.dedent(
        """
        import json
        import sys
        import urllib.error
        import urllib.request
        from pathlib import Path

        def parse_env(path: Path) -> dict[str, str]:
            data = {}
            if not path.exists():
                return data
            for raw_line in path.read_text().splitlines():
                line = raw_line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('export '):
                    line = line[len('export '):]
                if '=' not in line:
                    continue
                key, value = line.split('=', 1)
                data[key.strip()] = value.strip().strip('"').strip("'")
            return data

        env = parse_env(Path(sys.argv[1]))
        base = env.get('DIFY_API_BASE_URL', '').rstrip('/')
        key = env.get('DIFY_APP_API_KEY') or env.get('DIFY_API_KEY')
        body = json.dumps({
            'inputs': {'hospitalType': 'REGULAR'},
            'query': 'ops diagnostic ping',
            'response_mode': 'blocking',
            'conversation_id': '',
            'user': 'ops-diagnostic',
        }).encode('utf-8')
        request = urllib.request.Request(
            f'{base}/chat-messages',
            data=body,
            method='POST',
            headers={
                'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode('utf-8', 'replace')
                print(json.dumps({
                    'status': response.status,
                    'contentType': response.headers.get('Content-Type', ''),
                    'bodyPreview': ' '.join(raw.split())[:240],
                }))
        except urllib.error.HTTPError as error:
            raw = error.read().decode('utf-8', 'replace')
            print(json.dumps({
                'status': error.code,
                'contentType': error.headers.get('Content-Type', ''),
                'bodyPreview': ' '.join(raw.split())[:240],
            }))
        """
    ).strip()
    public_chat_raw = run_ssh(
        host=host,
        user=user,
        ssh_key=ssh_key,
        timeout=max(timeout, 90),
        script=remote_python_script(remote_public_chat_script, crm_env_path),
    )
    public_chat = json.loads(public_chat_raw)
    public_chat["diagnosis"] = diagnose_dify_status(
        int(public_chat.get("status", 0)),
        str(public_chat.get("bodyPreview", "")).lower(),
    )

    internal_api_health_script = textwrap.dedent(
        """
        import json
        import urllib.request

        try:
            payload = urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=15).read().decode('utf-8', 'replace')
            print(json.dumps({'ok': True, 'payload': payload}))
        except Exception as error:
            print(json.dumps({'ok': False, 'error': str(error)}))
        """
    ).strip()
    internal_health_raw = run_ssh(
        host=host,
        user=user,
        ssh_key=ssh_key,
        timeout=timeout,
        script=f"cd {shlex.quote(dify_dir)} && sudo docker compose exec -T api python3 - <<'PY'\n{internal_api_health_script}\nPY",
    )
    internal_health = json.loads(internal_health_raw)

    sandbox_match = (
        dify_env.get("CODE_EXECUTION_API_KEY") == dify_env.get("SANDBOX_API_KEY")
        and bool(dify_env.get("CODE_EXECUTION_API_KEY"))
    )

    hints: list[str] = []
    if not sandbox_match:
        hints.append("CODE_EXECUTION_API_KEY and SANDBOX_API_KEY differ. Sandbox-backed nodes may fail with 401.")
    if public_chat.get("status") == 401:
        hints.append("CRM is pointed at a Dify app key that this Dify instance does not recognize.")
    if public_chat.get("status") == 400 and "required in input form" in str(public_chat.get("bodyPreview", "")).lower():
        hints.append("Public Dify accepted the request, but the workflow expects CRM-supplied inputs. Use crm-smoke for a true end-to-end test.")
    if public_chat.get("status") == 502 and internal_health.get("ok"):
        hints.append("Public Dify is failing while internal api is healthy. Restart Dify nginx to refresh upstream container IPs.")

    return {
        "crmEnv": {
            "DIFY_API_BASE_URL": crm_env.get("DIFY_API_BASE_URL"),
            "DIFY_APP_API_KEY": mask_secret(crm_env.get("DIFY_APP_API_KEY")),
            "DIFY_DATASET_API_KEY": mask_secret(crm_env.get("DIFY_DATASET_API_KEY")),
            "PATIENT_APP_ORIGIN": crm_env.get("PATIENT_APP_ORIGIN"),
            "CHINA_ORIGIN": crm_env.get("CHINA_ORIGIN"),
        },
        "difyDockerEnv": {
            "CODE_EXECUTION_API_KEY": mask_secret(dify_env.get("CODE_EXECUTION_API_KEY")),
            "SANDBOX_API_KEY": mask_secret(dify_env.get("SANDBOX_API_KEY")),
            "sandboxKeysMatch": sandbox_match,
        },
        "dockerComposePs": ps_output,
        "publicChatProbe": public_chat,
        "internalApiHealth": internal_health,
        "hints": hints,
    }


def run_doctor(args: argparse.Namespace) -> int:
    results: dict[str, Any] = {}
    if args.ssh_key:
        print_section("Remote Dify / CRM check")
        results["remoteCheck"] = run_remote_check(
            host=args.host,
            user=args.user,
            ssh_key=args.ssh_key,
            crm_env_path=args.crm_env_path,
            dify_dir=args.dify_dir,
            timeout=args.timeout,
        )
        print_json("remoteCheck", results["remoteCheck"])

    if args.app_key:
        print_section("Direct Dify public chat check")
        results["difyChat"] = run_dify_chat_check_with_inputs(
            base_url=args.dify_base_url,
            app_key=args.app_key,
            message=args.message,
            user=args.user_id,
            inputs=parse_inputs_json(args.inputs_json),
            timeout=args.timeout,
        )
        print_json("difyChat", results["difyChat"])

    if args.include_crm_smoke:
        ensure(
            bool(args.crm_base_url),
            "--crm-base-url is required when --include-crm-smoke is set.",
        )
        print_section("CRM onboarding/history/chat smoke")
        smoke_email = args.email or f"dify-ops+{int(time.time())}@example.com"
        results["crmSmoke"] = run_crm_smoke(
            crm_base_url=args.crm_base_url,
            name=args.name,
            email=smoke_email,
            phone=args.phone,
            gender=args.gender,
            country=args.country,
            department=args.department,
            department_code=args.department_code,
            disease=args.disease,
            destination=args.destination,
            treatment_time=args.treatment_time,
            chat_message=args.message,
            timeout=args.timeout,
        )
        print_json("crmSmoke", results["crmSmoke"])

    if not results:
        raise CommandError(
            "No checks were requested. Provide at least one of --ssh-key, --app-key, or --include-crm-smoke."
        )
    return 0


def command_dify_chat(args: argparse.Namespace) -> int:
    print_json(
        "difyChat",
        run_dify_chat_check_with_inputs(
            base_url=args.base_url,
            app_key=args.app_key,
            message=args.message,
            user=args.user_id,
            inputs=parse_inputs_json(args.inputs_json),
            timeout=args.timeout,
        ),
    )
    return 0


def command_crm_smoke(args: argparse.Namespace) -> int:
    email = args.email or f"dify-ops+{uuid.uuid4().hex[:8]}@example.com"
    print_json(
        "crmSmoke",
        run_crm_smoke(
            crm_base_url=args.crm_base_url,
            name=args.name,
            email=email,
            phone=args.phone,
            gender=args.gender,
            country=args.country,
            department=args.department,
            department_code=args.department_code,
            disease=args.disease,
            destination=args.destination,
            treatment_time=args.treatment_time,
            chat_message=args.message,
            timeout=args.timeout,
        ),
    )
    return 0


def command_remote_check(args: argparse.Namespace) -> int:
    print_json(
        "remoteCheck",
        run_remote_check(
            host=args.host,
            user=args.user,
            ssh_key=args.ssh_key,
            crm_env_path=args.crm_env_path,
            dify_dir=args.dify_dir,
            timeout=args.timeout,
        ),
    )
    return 0


def add_shared_smoke_args(
    parser: argparse.ArgumentParser,
    *,
    crm_base_url_default: str | None = DEFAULT_CRM_BASE_URL,
) -> None:
    parser.add_argument("--crm-base-url", default=crm_base_url_default)
    parser.add_argument("--name", default="Dify Ops Smoke")
    parser.add_argument("--email")
    parser.add_argument("--phone", default="+8613800012345")
    parser.add_argument("--gender", default="female")
    parser.add_argument("--country", default="China")
    parser.add_argument("--department", default="ENT/Otolaryngology")
    parser.add_argument("--department-code", default="ent-otolaryngology")
    parser.add_argument("--disease", default="ear redness")
    parser.add_argument("--destination", default="Shanghai")
    parser.add_argument("--treatment-time", default="ASAP")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Dify and CRM operational diagnostics for Medora CRM v2.",
    )
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)

    subparsers = parser.add_subparsers(dest="command", required=True)

    dify_chat = subparsers.add_parser("dify-chat", help="Probe the public Dify /chat-messages endpoint directly.")
    dify_chat.add_argument("--base-url", default=DEFAULT_DIFY_BASE_URL)
    dify_chat.add_argument("--app-key", required=True)
    dify_chat.add_argument("--message", default="Hello, I want to learn about your services")
    dify_chat.add_argument("--user-id", default=DEFAULT_APP_USER)
    dify_chat.add_argument("--inputs-json", help='Override workflow inputs JSON. Default: {"hospitalType":"regular"}')
    dify_chat.set_defaults(func=command_dify_chat)

    crm_smoke = subparsers.add_parser("crm-smoke", help="Run onboarding -> history -> chat against CRM.")
    add_shared_smoke_args(crm_smoke)
    crm_smoke.add_argument("--message", default="Hello, I want to learn about your services")
    crm_smoke.set_defaults(func=command_crm_smoke)

    remote_check = subparsers.add_parser("remote-check", help="Inspect remote CRM and Dify operational state over SSH.")
    remote_check.add_argument("--ssh-key", required=True)
    remote_check.add_argument("--host", default=DEFAULT_REMOTE_HOST)
    remote_check.add_argument("--user", default=DEFAULT_REMOTE_USER)
    remote_check.add_argument("--crm-env-path", default=DEFAULT_REMOTE_CRM_ENV_PATH)
    remote_check.add_argument("--dify-dir", default=DEFAULT_REMOTE_DIFY_DIR)
    remote_check.set_defaults(func=command_remote_check)

    doctor = subparsers.add_parser(
        "doctor",
        help="Run read-only remote checks/public Dify probes by default; opt into CRM smoke explicitly.",
    )
    doctor.add_argument("--ssh-key")
    doctor.add_argument("--host", default=DEFAULT_REMOTE_HOST)
    doctor.add_argument("--user", default=DEFAULT_REMOTE_USER)
    doctor.add_argument("--crm-env-path", default=DEFAULT_REMOTE_CRM_ENV_PATH)
    doctor.add_argument("--dify-dir", default=DEFAULT_REMOTE_DIFY_DIR)
    doctor.add_argument("--dify-base-url", default=DEFAULT_DIFY_BASE_URL)
    doctor.add_argument("--app-key")
    doctor.add_argument("--user-id", default=DEFAULT_APP_USER)
    doctor.add_argument("--inputs-json", help='Override workflow inputs JSON for the direct Dify probe. Default: {"hospitalType":"regular"}')
    doctor.add_argument("--include-crm-smoke", action="store_true", help="Opt in to a real CRM onboarding/history/chat smoke.")
    add_shared_smoke_args(doctor, crm_base_url_default=None)
    doctor.add_argument("--message", default="Hello, I want to learn about your services")
    doctor.set_defaults(func=run_doctor)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except CommandError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
