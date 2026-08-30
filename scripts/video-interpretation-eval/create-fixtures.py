#!/usr/bin/env python3
"""Create de-identified e2e fixtures: hosted deployment row, eval consultation, patient participant row."""
import hashlib, json, subprocess, sys, uuid

def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'")
    return env

api_env = load_env('/opt/medora/medora-crm-v2-api/.env')
repo_env = load_env('/opt/medora/medical-crm-v2/.env')
db = api_env['DATABASE_URL']
secret = repo_env['LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET']
digest = hashlib.sha256(secret.encode()).hexdigest()
agent_name = repo_env.get('LIVEKIT_INTERPRETATION_AGENT_NAME', 'medora-interpretation-v1')

consultation_id = str(uuid.uuid4())
room_name = f'consultation-{consultation_id}'
host_identity = 'doctor-eval-001'
patient_identity = 'patient-eval-001'

stmts = [
    # hosted deployment registered against the current bootstrap secret
    (f"INSERT INTO video_consultation_hosted_deployments (deployment_name, bootstrap_secret_digest, enabled) "
     f"VALUES ('{agent_name}', '{digest}', true) "
     f"ON CONFLICT (deployment_name) DO UPDATE SET bootstrap_secret_digest = EXCLUDED.bootstrap_secret_digest, "
     f"enabled = true, revoked_at = NULL, rotated_at = now() RETURNING id;"),
    # de-identified evaluation consultation
    (f"INSERT INTO video_consultations (id, room_name, status, host_identity, patient_language, "
     f"title, description, started_at, duration_minutes) "
     f"VALUES ('{consultation_id}', '{room_name}', 'IN_PROGRESS', '{host_identity}', 'en', "
     f"'E2E DEIDENTIFIED EVALUATION - DO NOT USE FOR PATIENTS', "
     f"'Synthetic eval room created 2026-08-30 for interpretation qualification', now(), 30) "
     f"RETURNING id;"),
    # patient participant admitted to the consultation
    (f"INSERT INTO video_consultation_participants (consultation_id, identity, display_name, role, joined_at) "
     f"VALUES ('{consultation_id}', '{patient_identity}', 'Eval Patient', 'PATIENT', now()) RETURNING id;"),
]

out = {}
for i, stmt in enumerate(stmts):
    p = subprocess.run(['psql', db, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', stmt],
                       capture_output=True, text=True)
    if p.returncode != 0:
        print(f'statement {i} failed: {p.stderr[:400]}', file=sys.stderr)
        sys.exit(1)
    out[f'stmt{i}'] = p.stdout.strip()

fixtures = {
    'consultationId': consultation_id,
    'roomName': room_name,
    'hostIdentity': host_identity,
    'patientIdentity': patient_identity,
    'deploymentId': out['stmt0'].split('\n')[-1],
    'agentName': agent_name,
}
print(json.dumps(fixtures, indent=2))
p = subprocess.run(['sudo', 'tee', '/etc/medora/eval-fixtures.json'],
                   input=json.dumps(fixtures), capture_output=True, text=True)
assert p.returncode == 0
subprocess.run(['sudo', 'chmod', '600', '/etc/medora/eval-fixtures.json'], check=True)
