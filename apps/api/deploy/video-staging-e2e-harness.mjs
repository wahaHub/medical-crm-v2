import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { URL, URLSearchParams } from 'node:url';
import { AccessToken } from 'livekit-server-sdk';
import { getCrmDb } from '@medical-crm/infrastructure/database';

const HOST = '127.0.0.1';
const PORT = Number(process.env.VIDEO_STAGING_E2E_PORT ?? 3003);
const LIFETIME_SECONDS = Math.min(
  Number(process.env.VIDEO_STAGING_E2E_LIFETIME_SECONDS ?? 1_500),
  1_800,
);
const API_BASE_URL = new URL(process.env.VIDEO_STAGING_API_URL ?? 'http://127.0.0.1:3002');
const SESSION_SECRET = randomBytes(24).toString('base64url');
const CONSULTATION_ID = randomUUID();
const ROOM_NAME = `medora-deidentified-e2e-${randomBytes(8).toString('hex')}`;
const PATIENT_IDENTITY = `e2e-patient-${randomBytes(6).toString('hex')}`;
const EXPIRES_AT = new Date(Date.now() + LIFETIME_SECONDS * 1_000).toISOString();
const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVEKIT_CLIENT_BUNDLE = resolve(
  __dirname,
  '../../admin/node_modules/livekit-client/dist/livekit-client.umd.js',
);

const requiredEnvironment = [
  'DATABASE_URL',
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_CLIENT_ID',
  'VIDEO_STAGING_USERNAME',
  'VIDEO_STAGING_PASSWORD',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_INTERPRETATION_AGENT_NAME',
  'LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET',
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`Missing E2E environment: ${missing.join(', ')}`);
if (process.env.VIDEO_INTERPRETATION_DEPLOYMENT_TIER !== 'STAGING'
  || process.env.VIDEO_INTERPRETATION_DEIDENTIFIED_E2E_ENABLED !== 'true'
  || process.env.VIDEO_INTERPRETATION_ENABLED !== 'true') {
  throw new Error('The staging-only de-identified E2E gates are not enabled');
}
if (!Number.isInteger(PORT) || PORT < 1_024 || PORT > 65_535) {
  throw new Error('VIDEO_STAGING_E2E_PORT must be an unprivileged TCP port');
}
if (!Number.isFinite(LIFETIME_SECONDS) || LIFETIME_SECONDS < 300) {
  throw new Error('VIDEO_STAGING_E2E_LIFETIME_SECONDS must be between 300 and 1800');
}
await stat(LIVEKIT_CLIENT_BUNDLE);

const sql = getCrmDb().$client;
let operatorAccessToken = null;
let operatorTokenExpiresAtMs = 0;
let releaseApprovalId = null;
let stopped = false;

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; media-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'content-type': 'application/json; charset=utf-8',
    'permissions-policy': 'camera=(self), microphone=(self)',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16_384) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function getOperatorAccessToken() {
  if (operatorAccessToken && Date.now() + 30_000 < operatorTokenExpiresAtMs) {
    return operatorAccessToken;
  }
  const response = await globalThis.fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID,
      grant_type: 'password',
      username: process.env.VIDEO_STAGING_USERNAME,
      password: process.env.VIDEO_STAGING_PASSWORD,
      scope: 'openid email profile',
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`staging_operator_token_failed:${response.status}:${body.error ?? 'unknown'}`);
  }
  const payload = jwtPayload(body.access_token);
  if (payload.azp !== process.env.KEYCLOAK_CLIENT_ID
    || payload.email !== 'video-staging-admin@invalid.example'
    || !payload.realm_access?.roles?.includes('admin')) {
    throw new Error('staging_operator_token_claims_invalid');
  }
  operatorAccessToken = body.access_token;
  operatorTokenExpiresAtMs = Number(payload.exp) * 1_000;
  return operatorAccessToken;
}

async function apiRequest(path, options = {}) {
  const token = await getOperatorAccessToken();
  const response = await globalThis.fetch(new URL(path, API_BASE_URL), {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`staging_api_${response.status}:${body.message ?? body.error ?? 'unknown'}`);
  }
  return body;
}

async function createPatientToken() {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: PATIENT_IDENTITY,
    name: 'De-identified test patient',
    ttl: 15 * 60,
  });
  token.addGrant({
    room: ROOM_NAME,
    roomJoin: true,
    roomAdmin: false,
    roomList: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  return await token.toJwt();
}

async function prepareAuthority() {
  const deploymentDigest = createHash('sha256')
    .update(process.env.LIVEKIT_INTERPRETATION_BOOTSTRAP_SECRET, 'utf8')
    .digest('hex');
  await sql.begin(async (transaction) => {
    const query = transaction;
    await query`
      INSERT INTO video_consultations (
        id, room_name, status, started_at, title, description,
        host_identity, patient_language, duration_minutes, metadata
      ) VALUES (
        ${CONSULTATION_ID}, ${ROOM_NAME}, 'IN_PROGRESS', now(),
        'De-identified interpretation E2E',
        'Synthetic staging-only media; no real patient data',
        ${PATIENT_IDENTITY}, 'zh', 5,
        ${JSON.stringify({
          synthetic: true,
          classification: 'DEIDENTIFIED_EVALUATION',
          expiresAt: EXPIRES_AT,
        })}::jsonb
      )
    `;
    await query`
      INSERT INTO video_consultation_participants (
        consultation_id, identity, display_name, role, joined_at, metadata
      ) VALUES (
        ${CONSULTATION_ID}, ${PATIENT_IDENTITY}, 'De-identified test patient',
        'PATIENT', now(), '{"synthetic":true}'::jsonb
      )
    `;
    await query`
      INSERT INTO video_consultation_hosted_deployments (
        deployment_name, bootstrap_secret_digest, enabled, revoked_at
      ) VALUES (
        ${process.env.LIVEKIT_INTERPRETATION_AGENT_NAME}, ${deploymentDigest}, true, NULL
      )
      ON CONFLICT (deployment_name) DO UPDATE SET
        bootstrap_secret_digest = EXCLUDED.bootstrap_secret_digest,
        enabled = true,
        rotated_at = now(),
        revoked_at = NULL
    `;
  });

  const approval = await apiRequest('/api/v2/video-interpretation/release-approvals', {
    method: 'POST',
    body: JSON.stringify({
      approvalScope: 'SYNTHETIC_E2E',
      syntheticConsultationId: CONSULTATION_ID,
      dataClassification: 'DEIDENTIFIED_EVALUATION',
      provider: 'openai',
      providerModel: 'gpt-realtime-translate',
      providerEndpoint: 'wss://api.openai.com/v1/realtime/translations',
      processingRegion: 'provider-managed',
      approvalReference: `staging-deidentified-e2e-${CONSULTATION_ID}`,
      contractsApproved: false,
      privacyVerified: false,
      observabilityDisabled: false,
      retentionVerified: false,
      providerRateMicrodollarsPerMinute: 34_000,
      perRoomHardLimitMicrodollars: 500_000,
      dailyHardLimitMicrodollars: 1_000_000,
      monthlyHardLimitMicrodollars: 5_000_000,
      expiresAt: EXPIRES_AT,
    }),
  });
  releaseApprovalId = approval.approval.id;
  await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/interpretation/allowlist`, {
    method: 'POST',
    body: JSON.stringify({ releaseApprovalId, expiresAt: EXPIRES_AT }),
  });
}

async function startInterpretation(sourceLanguage) {
  if (!['zh', 'en'].includes(sourceLanguage)) throw new Error('source_language_invalid');
  const doctorToken = await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/token`, {
    method: 'POST',
    body: '{}',
  });
  await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/interpretation/consents`, {
    method: 'POST',
    body: JSON.stringify({
      participantIdentities: [doctorToken.identity, PATIENT_IDENTITY],
      policyVersion: 'video-ai-consent-v1',
      witnessConfirmed: true,
    }),
  });
  return await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/interpretation/start`, {
    method: 'POST',
    body: JSON.stringify({
      sourceLanguage,
      maximumAiDurationSeconds: 300,
      dataClassification: 'DEIDENTIFIED_EVALUATION',
    }),
  });
}

async function stopInterpretation() {
  return await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/interpretation/stop`, {
    method: 'POST',
    body: '{}',
  });
}

async function status() {
  return await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/interpretation`);
}

async function cleanup() {
  if (stopped) return;
  stopped = true;
  try {
    await stopInterpretation();
  } catch {
    // There may be no job if the user never pressed Start.
  }
  if (releaseApprovalId) {
    try {
      await apiRequest(`/api/v2/video-interpretation/release-approvals/${releaseApprovalId}/revoke`, {
        method: 'POST',
        body: '{}',
      });
    } catch {
      // The reconciler and fixed application deadline remain the final fence.
    }
  }
  try {
    await sql`
      UPDATE video_consultations
      SET status = 'COMPLETED', ended_at = now(), updated_at = now()
      WHERE id = ${CONSULTATION_ID} AND status IN ('SCHEDULED', 'IN_PROGRESS')
    `;
  } finally {
    await sql.end();
  }
}

function page(role) {
  const safeRole = role === 'doctor' ? 'doctor' : 'patient';
  const otherRole = safeRole === 'doctor' ? 'patient' : 'doctor';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Medora 脱敏翻译 E2E · ${safeRole}</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#e7eef7}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}.banner{border:1px solid #7c5b17;background:#281d06;color:#ffe6a7;padding:14px 16px;border-radius:12px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.card{background:#0e1b2c;border:1px solid #223852;border-radius:14px;padding:18px}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}button,select{font:inherit;border:0;border-radius:9px;padding:10px 14px}button{background:#1f9d8a;color:white;cursor:pointer}button.stop{background:#b04b45}button:disabled{opacity:.45;cursor:not-allowed}select{background:#172a40;color:white}.status{color:#9fbedb}.caption{border-left:3px solid #36c7b0;padding:8px 12px;margin:9px 0;background:#102438}.source{font-size:13px;color:#93abc2}.translated{font-size:18px;margin-top:4px}.media{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.media video{width:100%;background:#020712;border-radius:10px}.audio-row{padding:8px;border:1px solid #26425e;border-radius:9px;margin-top:8px}.audio-row audio{width:100%}code{color:#93e8d7}.small{font-size:13px;color:#9fbedb}@media(max-width:800px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <h1>Medora AI 字幕 / 翻译语音 E2E</h1>
  <div class="banner"><strong>硬限制：</strong>仅 staging、仅脱敏台词、1 个 AI 房间、最长 5 分钟。不要说姓名、电话、病历、诊断或任何真实患者资料。</div>
  <div class="grid">
    <section class="card">
      <h2>${safeRole === 'doctor' ? '医生端' : '患者端'}</h2>
      <p class="status" id="status">尚未加入</p>
      <div class="controls">
        <button id="join">加入并打开麦克风</button>
        <button id="camera">打开摄像头</button>
        ${safeRole === 'doctor' ? '<select id="language"><option value="zh">患者中文 → 医生英文</option><option value="en">患者英文 → 医生中文</option></select><button id="start" disabled>确认双方同意并启动 AI</button><button class="stop" id="stop" disabled>停止 AI</button>' : ''}
      </div>
      <p class="small">请另开一个窗口：<code>/${SESSION_SECRET}/${otherRole}</code>。同一台电脑测试时请戴耳机，避免扬声器回授。</p>
      <h3>视频</h3><div class="media" id="videos"></div>
      <h3>音频轨道</h3><div id="audios"></div>
    </section>
    <aside class="card">
      <h2>建议脱敏台词</h2>
      <p><strong>患者中文：</strong>“这是一次脱敏翻译测试。我今天感觉很好。”</p>
      <p><strong>医生英文：</strong>“Hello. This is a de-identified translation test.”</p>
      <h2>实时字幕</h2>
      <div id="captions"><p class="small">启动 AI 后，字幕会显示在这里。</p></div>
    </aside>
  </div>
</main>
<script src="/${SESSION_SECRET}/livekit.js"></script>
<script>
  const ROLE=${JSON.stringify(safeRole)};
  const BASE='/${SESSION_SECRET}';
  const room=new LivekitClient.Room({adaptiveStream:true,dynacast:true});
  const statusEl=document.getElementById('status');
  const captions=document.getElementById('captions');
  const joinButton=document.getElementById('join');
  const cameraButton=document.getElementById('camera');
  const startButton=document.getElementById('start');
  const stopButton=document.getElementById('stop');
  let joined=false;
  function setStatus(message){statusEl.textContent=message}
  function attachTrack(track,publication,participant){
    if(track.kind===LivekitClient.Track.Kind.Video){
      const element=track.attach();element.autoplay=true;element.playsInline=true;
      element.dataset.sid=publication.trackSid;document.getElementById('videos').append(element);return;
    }
    if(track.kind===LivekitClient.Track.Kind.Audio){
      const row=document.createElement('div');row.className='audio-row';row.dataset.sid=publication.trackSid;
      const label=document.createElement('div');label.className='small';label.textContent=participant.identity+' · '+(publication.trackName||'audio');
      const element=track.attach();element.autoplay=true;element.controls=true;row.append(label,element);document.getElementById('audios').append(row);
    }
  }
  room.on(LivekitClient.RoomEvent.TrackSubscribed,attachTrack);
  room.on(LivekitClient.RoomEvent.TrackUnsubscribed,(_track,publication)=>{
    document.querySelectorAll('[data-sid="'+publication.trackSid+'"]').forEach(node=>node.remove());
  });
  room.on(LivekitClient.RoomEvent.ParticipantConnected,p=>setStatus('已加入；远端在线：'+p.identity));
  room.on(LivekitClient.RoomEvent.DataReceived,(payload,participant,_kind,topic)=>{
    if(topic!=='subtitle'||payload.byteLength>65536||!participant?.identity.startsWith('translator-'))return;
    try{
      const message=JSON.parse(new TextDecoder().decode(payload));
      if(message.schema!=='medora.subtitle.v1'||typeof message.sourceText!=='string'||typeof message.translatedText!=='string')return;
      if(captions.querySelector('.small'))captions.replaceChildren();
      const item=document.createElement('div');item.className='caption';
      const source=document.createElement('div');source.className='source';source.textContent=message.from+' · '+message.fromLanguage+': '+message.sourceText;
      const translated=document.createElement('div');translated.className='translated';translated.textContent=message.toLanguage+': '+message.translatedText;
      item.append(source,translated);captions.prepend(item);while(captions.children.length>20)captions.lastChild.remove();
    }catch{}
  });
  joinButton.addEventListener('click',async()=>{
    joinButton.disabled=true;
    try{
      setStatus('正在获取短时 token…');
      const response=await fetch(BASE+'/api/config?role='+ROLE,{cache:'no-store'});const config=await response.json();
      if(!response.ok)throw new Error(config.error||'config_failed');
      await room.connect(config.livekitUrl,config.token);await room.localParticipant.setMicrophoneEnabled(true);
      joined=true;setStatus('已加入 '+config.roomName+'；麦克风已打开');joinButton.textContent='已加入';cameraButton.disabled=false;
      if(startButton)startButton.disabled=false;
    }catch(error){setStatus('加入失败：'+error.message);joinButton.disabled=false}
  });
  cameraButton.addEventListener('click',async()=>{
    if(!joined)return;
    const enabled=!room.localParticipant.isCameraEnabled;await room.localParticipant.setCameraEnabled(enabled);cameraButton.textContent=enabled?'关闭摄像头':'打开摄像头';
  });
  if(startButton)startButton.addEventListener('click',async()=>{
    if(!confirm('确认两个窗口中的测试人员都同意 AI 字幕和翻译语音，并且只会说脱敏测试台词？'))return;
    startButton.disabled=true;setStatus('正在启动 Hosted Agent…');
    try{const response=await fetch(BASE+'/api/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceLanguage:document.getElementById('language').value})});const body=await response.json();if(!response.ok)throw new Error(body.error||'start_failed');setStatus('AI 已启动：'+body.job.status);stopButton.disabled=false}catch(error){setStatus('启动失败：'+error.message);startButton.disabled=false}
  });
  if(stopButton)stopButton.addEventListener('click',async()=>{
    stopButton.disabled=true;setStatus('正在停止 AI…');
    try{const response=await fetch(BASE+'/api/stop',{method:'POST'});const body=await response.json();if(!response.ok)throw new Error(body.error||'stop_failed');setStatus('AI 已收到停止指令');startButton.disabled=false}catch(error){setStatus('停止失败：'+error.message);stopButton.disabled=false}
  });
  setInterval(async()=>{if(!joined)return;try{const response=await fetch(BASE+'/api/status',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(body.job)setStatus('房间在线 · AI '+body.job.status+' · 已用预算 $'+(body.job.consumedMicrodollars/1000000).toFixed(4))}catch{}},2000);
</script>
</body></html>`;
}

await prepareAuthority();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);
    const prefix = `/${SESSION_SECRET}`;
    if (!url.pathname.startsWith(prefix)) return jsonResponse(response, 404, { error: 'not_found' });
    if (request.method === 'GET' && url.pathname === `${prefix}/livekit.js`) {
      response.writeHead(200, {
        'cache-control': 'private, max-age=300',
        'content-type': 'text/javascript; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      createReadStream(LIVEKIT_CLIENT_BUNDLE).pipe(response);
      return;
    }
    if (request.method === 'GET'
      && [`${prefix}/doctor`, `${prefix}/patient`].includes(url.pathname)) {
      const role = url.pathname.endsWith('/doctor') ? 'doctor' : 'patient';
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; media-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'content-type': 'text/html; charset=utf-8',
        'permissions-policy': 'camera=(self), microphone=(self)',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      });
      response.end(page(role));
      return;
    }
    if (request.method === 'GET' && url.pathname === `${prefix}/api/config`) {
      const role = url.searchParams.get('role');
      if (!['doctor', 'patient'].includes(role)) return jsonResponse(response, 400, { error: 'role_invalid' });
      if (role === 'doctor') {
        const config = await apiRequest(`/api/v2/video-consultations/${CONSULTATION_ID}/token`, {
          method: 'POST',
          body: '{}',
        });
        return jsonResponse(response, 200, config);
      }
      return jsonResponse(response, 200, {
        success: true,
        token: await createPatientToken(),
        livekitUrl: process.env.LIVEKIT_URL,
        identity: PATIENT_IDENTITY,
        roomName: ROOM_NAME,
      });
    }
    if (request.method === 'POST' && url.pathname === `${prefix}/api/start`) {
      const body = await readJson(request);
      return jsonResponse(response, 200, await startInterpretation(body.sourceLanguage));
    }
    if (request.method === 'POST' && url.pathname === `${prefix}/api/stop`) {
      return jsonResponse(response, 200, await stopInterpretation());
    }
    if (request.method === 'GET' && url.pathname === `${prefix}/api/status`) {
      return jsonResponse(response, 200, await status());
    }
    return jsonResponse(response, 404, { error: 'not_found' });
  } catch (error) {
    return jsonResponse(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  globalThis.console.log(JSON.stringify({
    ready: true,
    bind: `${HOST}:${PORT}`,
    doctorPath: `/${SESSION_SECRET}/doctor`,
    patientPath: `/${SESSION_SECRET}/patient`,
    consultationId: CONSULTATION_ID,
    roomName: ROOM_NAME,
    expiresAt: EXPIRES_AT,
    classification: 'DEIDENTIFIED_EVALUATION',
    maximumAiDurationSeconds: 300,
    maximumActiveAiRooms: 1,
  }));
});

const deadline = globalThis.setTimeout(() => {
  server.close(() => void cleanup().finally(() => process.exit(0)));
}, LIFETIME_SECONDS * 1_000);
deadline.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    globalThis.clearTimeout(deadline);
    server.close(() => void cleanup().finally(() => process.exit(0)));
  });
}
