#!/usr/bin/env python3
"""Create/verify the eval operator (Keycloak user + realm admin role + CRM users row + password-grant token)."""
import json, os, secrets, subprocess, sys, urllib.parse, urllib.request

raise SystemExit(
    'This legacy evaluator is disabled. Use apps/api/deploy/video-staging-e2e-harness.mjs.'
)

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

env = load_env('/opt/medora/medora-crm-v2-api/.env')
issuer = env['KEYCLOAK_ISSUER']
kc_base = issuer.split('/realms/')[0]
realm = env['KEYCLOAK_REALM']
client_id = env['KEYCLOAK_CLIENT_ID']

def http(method, url, data=None, token=None, form=False, expect=(200, 201, 204)):
    body = None
    headers = {}
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
            body = json.dumps(data).encode()
            headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or '{}'
            return json.loads(raw) if raw.strip().startswith(('{', '[')) else raw
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        raise SystemExit(f'HTTP {e.code} {method} {url}: {detail}')

admin = http('POST', f'{kc_base}/realms/master/protocol/openid-connect/token', form=True, data={
    'client_id': 'admin-cli',
    'username': env['KEYCLOAK_ADMIN_USERNAME'],
    'password': env['KEYCLOAK_ADMIN_PASSWORD'],
    'grant_type': 'password',
})['access_token']
print('admin token: OK')

users = http('GET', f'{kc_base}/admin/realms/{realm}/users?username=eval-operator&exact=true', token=admin)
if not users:
    users = http('GET', f'{kc_base}/admin/realms/{realm}/users?email=eval-operator@medora.local&exact=true', token=admin)
if users:
    kc_uid = users[0]['id']
    print(f'keycloak user exists: {kc_uid}')
else:
    http('POST', f'{kc_base}/admin/realms/{realm}/users', token=admin, data={
        'username': 'eval-operator', 'email': 'eval-operator@medora.local',
        'enabled': True, 'emailVerified': True, 'firstName': 'Eval', 'lastName': 'Operator',
    })
    users = http('GET', f'{kc_base}/admin/realms/{realm}/users?username=eval-operator&exact=true', token=admin)
    kc_uid = users[0]['id']
    print(f'created keycloak user: {kc_uid}')

pw_path = '/etc/medora/eval-operator-password'
r = subprocess.run(['sudo', 'cat', pw_path], capture_output=True, text=True)
password = r.stdout.strip() if r.returncode == 0 else ''
if not password:
    password = secrets.token_hex(12)
    p = subprocess.run(['sudo', 'tee', pw_path], input=password, capture_output=True, text=True)
    assert p.returncode == 0
    subprocess.run(['sudo', 'chmod', '600', pw_path], check=True)

http('PUT', f'{kc_base}/admin/realms/{realm}/users/{kc_uid}/reset-password', token=admin,
     data={'type': 'password', 'value': password, 'temporary': False})
print('password set')

role = http('GET', f'{kc_base}/admin/realms/{realm}/roles/admin', token=admin)
http('POST', f'{kc_base}/admin/realms/{realm}/users/{kc_uid}/role-mappings/realm', token=admin, data=[role])
print('realm role admin assigned')

sql = ("INSERT INTO users (email, name, role, status, keycloak_user_id, updated_at) "
       f"VALUES ('eval-operator@medora.local', 'Eval Operator', 'ADMIN', 'active', '{kc_uid}', now()) "
       "ON CONFLICT DO NOTHING;")
p = subprocess.run(['psql', env['DATABASE_URL'], '-v', 'ON_ERROR_STOP=1', '-c', sql], capture_output=True, text=True)
if p.returncode != 0:
    raise SystemExit(f'psql failed: {p.stderr[:300]}')
print('crm user row ensured')

tok = http('POST', f'{issuer}/protocol/openid-connect/token', form=True, data={
    'client_id': client_id, 'username': 'eval-operator@medora.local',
    'password': password, 'grant_type': 'password', 'scope': 'openid profile email',
})
print('operator token OK, expires_in', tok['expires_in'])
p = subprocess.run(['sudo', 'tee', '/etc/medora/eval-operator-token'], input=tok['access_token'],
                   capture_output=True, text=True)
assert p.returncode == 0
subprocess.run(['sudo', 'chmod', '600', '/etc/medora/eval-operator-token'], check=True)
print(f'EVAL_KC_UID={kc_uid}')
