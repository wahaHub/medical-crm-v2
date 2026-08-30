#!/usr/bin/env python3
"""STOP the orphaned interpretation job, then re-run the full chain to START a fresh one."""
import json, subprocess, sys, time, urllib.parse, urllib.request

API = 'http://127.0.0.1:3001'

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
fixtures = json.loads(open('/tmp/eval-fixtures.json').read())
password = open('/tmp/eval-operator-password').read().strip()

def http_json(method, url, data=None, token=None, form=False):
    body, headers = None, {}
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
            text = resp.read().decode()
            return resp.status, json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]

_, tok = http_json('POST', f"{api_env['KEYCLOAK_ISSUER']}/protocol/openid-connect/token", form=True, data={
    'client_id': api_env['KEYCLOAK_CLIENT_ID'], 'client_secret': api_env['KEYCLOAK_CLIENT_SECRET'],
    'username': 'eval-operator@medora.local', 'password': password,
    'grant_type': 'password', 'scope': 'openid profile email',
})
token = tok['access_token']
cid = fixtures['consultationId']

st, stop = http_json('POST', f'{API}/api/v2/video-consultations/{cid}/interpretation/stop',
                     token=token, data={})
print('STOP old job:', st, json.dumps(stop)[:300])

# wait for the reconciler to finish cleanup (dispatch removal etc.)
time.sleep(8)

st, start = http_json('POST', f'{API}/api/v2/video-consultations/{cid}/interpretation/start',
                      token=token, data={'sourceLanguage': 'en',
                                         'dataClassification': 'DEIDENTIFIED_EVALUATION',
                                         'maximumAiDurationSeconds': 1800})
print('START:', st, json.dumps(start)[:600])
