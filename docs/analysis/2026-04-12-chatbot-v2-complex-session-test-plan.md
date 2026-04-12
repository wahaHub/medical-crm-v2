# Chatbot V2 Complex Session Test Plan

## 目标

这轮测试不是只看一两句能不能回复，而是同时覆盖：

- FAQ / process explanation
- progression 推进
- `COLLECT_MEDICAL_INPUTS` 的 `pre / active / post`
- `RECOMMENDATION` 的进入与解释
- `ONLINE_CONSULT` 的 required 语义
- `HUMAN_HANDOFF.pre -> active -> post`
- 查询型 resource
- 问卷提交后的 truth 对齐
- progression family 的 `502` 根因取证

## 当前部署基线

- CRM API: `https://crmapi.medicaltourismchina.health`
- CRM deploy source: clean worktree `codex/chatbot-v2-smoke-20260412`
- base repo commit: `b4653a7`
- composer app key: `app-oVCgMomvUBR9VEac3hKq3Rie`
- classifier app key: `app-wArLT3lvOs4HX4BXfXpE2nTp`
- faq grounding app key: `app-XypTX7zJIPHE65KMQ9EYkIXv`

## 统一观测项

每一轮都记录：

- user message
- HTTP status
- answer preview
- `journeySnapshot`
- `resourceTypes`
- `requestClass`
- `targetResourceTypes`
- `includeProgressionFollowUp`
- 必要时 `/api/patient/me` 的 truth

若出现 `502`，额外记录：

- 触发语句
- 该轮前的 `journeySnapshot`
- 该轮前的 top-level truth
- CRM 服务器日志时间窗

## Session 1：入口 FAQ + process explanation + progression

### 目的

- 确认 FAQ 能答
- 确认 process explanation 会把主流程停靠到合理位置
- 确认 progression family 不再随机炸

### 轮次

1. `What services do you provide for overseas patients?`
2. `How does your process work?`
3. `If this makes sense, we can continue.`
4. `What information do you need next?`

### 预期

- 前两轮不应错误进入推荐或问诊
- `journeySnapshot` 应稳定停在 `COLLECT_MEDICAL_INPUTS.pre` 附近
- progression 句子不应 `502`

## Session 2：资料阶段插 FAQ + 明确要问卷

### 目的

- FAQ 插入不能打断主流程
- `QUESTIONNAIRE` resource 和文案必须一致

### 轮次

1. `I have an ear problem and want to continue to the next step.`
2. `Before I upload anything, how long does this usually take?`
3. `Can you open the questionnaire for me?`
4. `Show me the questionnaire now.`

### 预期

- FAQ 后仍停在 `COLLECT_MEDICAL_INPUTS`
- `QUESTIONNAIRE` 一旦出现在 resources，中英文文案不能再否认其可用

## Session 3：问卷提交 + receipt + collect post

### 目的

- 验证问卷提交 truth
- 验证 `COLLECT_MEDICAL_INPUTS.post`
- 验证 receipt 语义

### 前置

- 用 patient-protected intake submit 接口提交默认 regular questionnaire

### 轮次

1. `Have you received my questionnaire?`
2. `What happens after you receive it?`
3. `Can we move to recommendations now?`

### 预期

- `/api/patient/me.medicalFormStatus = SUBMITTED`
- 第 1 轮必须承认已收到
- 第 2 轮应体现 collect post 的接收确认
- 第 3 轮不应 `502`

## Session 4：后续阶段再问 process explanation，不得回退

### 目的

- 解释流程能力可以在后续阶段继续用
- 但不能倒退到 `EXPLAIN_PROCESS.active`

### 轮次

1. `Why do you need this step before recommending hospitals?`
2. `Explain the process again briefly.`
3. `Okay, continue.`

### 预期

- 前两轮都可解释
- `journeySnapshot` 应保持在 recommendation / online consult 相关阶段
- progression 句子不应 `502`

## Session 5：recommendation dismiss -> online consult required

### 目的

- 验证 recommendation 可 dismiss
- 验证 online consult 是 required step

### 轮次

1. `I understand the recommendation. Let's move on.`
2. `Why do I have to do the online consult?`
3. `Can I skip this step?`

### 预期

- 能前进到 `ONLINE_CONSULT.pre`
- `ONLINE_CONSULT.pre` 文案要明确 required / cannot skip
- 不应被 dismiss 到更后

## Session 6：handoff pre -> active -> post

### 目的

- 验证人工接手三段式
- 验证 handoff 后插 FAQ / status 不回退

### 轮次

1. `I want a human advisor to take over.`
2. `Yes, please send my case to the administrator team now.`
3. `Before they contact me, can you explain what happens next?`
4. `Can you also check my medical invitation status?`

### 预期

- 第 1 轮进入 `HUMAN_HANDOFF.pre`
- 第 2 轮进入 `HUMAN_HANDOFF.active` 或 `post`
- 应出现“24 小时内联系”的 post 语义
- 第 3、4 轮后不应倒退到更早 stage

## Session 7：progression family stress

### 目的

- 专门覆盖 progression 语义族
- 为 `502` 根因定位保留高密度样本

### 轮次

1. `Okay, continue.`
2. `What information do you need next?`
3. `Tell me exactly what I should prepare.`
4. `Let's move to the next step now.`
5. `If that's the right path, go ahead.`

### 预期

- 全部返回 `200`
- 若失败，至少拿到一组稳定复现样本

## Session 8：hospital-aware / status-query sanity

### 目的

- 验证查询型 resource 在更后阶段仍可工作
- 验证 FAQ grounding 与 status lookup 不会扰乱主流程

### 轮次

1. `Can you check my medical invitation status?`
2. `What happens after that in your process?`
3. `Okay, continue with the required next step.`

### 预期

- 第 1 轮应尽量走查询型 resource
- 第 2 轮可解释，但不回退
- 第 3 轮继续从当前停靠点前进

## 取证策略

如果某轮 `502`，本轮不直接改代码，先做 3 件事：

1. 记录该轮输入和前一轮 `journeySnapshot`
2. 立即抓 CRM API 日志时间窗
3. 如果 CRM 只给出 provider-level `502`，继续缩到 classifier / faq-grounding / composer 哪一层

## 交付物

测试完成后输出一份结果报告，至少包含：

- 每个 session 的逐轮结果
- 通过 / 失败判定
- `QUESTIONNAIRE`、handoff、online consult required、progression 502 的单独结论
- progression 502 的根因分析或当前最小故障边界
