# Chatbot V2 Session Test Plan

## 背景

这份文档描述的是 `chatbot-v2` 在当前线上部署后的多轮 session 测试方案。

本轮测试的目标不是只看“能不能回复”，而是确认下面几件事是否同时成立：

- FAQ 能正常回答
- FAQ 可以穿插在主流程里，不打断 step 推进
- step 会单向前进，不会回退
- `pre` 和 `post` 的聊天体验是否自然
- resource 和文案是否一致
- 回答状态类问题时，是否读取 truth，而不是看错当前 resource 暴露状态

当前测试基线：

- CRM branch: `feature/phase-2bc`
- CRM commit: `b4653a7`
- composer app key: `app-SQkVBrzKy7AazvtVcSWLvAkw`
- classifier app key: `app-wArLT3lvOs4HX4BXfXpE2nTp`
- faq grounding app key: `app-XypTX7zJIPHE65KMQ9EYkIXv`

## 这轮重点验证的风险

这轮 session 重点盯 4 类风险：

1. `QUESTIONNAIRE` resource 已经可用，但文案仍说不可用
2. 问卷已提交后，机器人仍否认“已收到”
3. `HUMAN_HANDOFF.pre` 后续轮次会回退到更早 stage
4. FAQ / process explanation 穿插主流程时，会不会打断 progression 或错误回退

## 测试方式

每个 session 都会记录这些观察项：

- 用户每一轮输入
- 机器人每一轮文本回复
- 返回的 `journeySnapshot`
- 返回的 `resources`
- 必要时核对 `/api/patient/me` truth

判定优先级：

- `journeySnapshot` 是否合理
- `resources` 是否和回复文案一致
- 回答是否符合 FAQ / progression / status lookup 的语义
- 是否出现不应有的回退

## Session 1：入口 FAQ + 流程解释 + 轻推进

### 目的

验证：

- 早期自然语言会落到 FAQ / process explanation
- 回答流程解释时，可以顺手推进到下一步
- 但不会直接粗暴弹错 resource

### 对话

1. 用户：
   `I want to come to China for treatment. What services do you provide?`
2. 用户：
   `How does your process work?`
3. 用户：
   `If this makes sense, we can continue.`

### 预期

- 第 1 轮主要是 FAQ
- 第 2 轮主要是 `process_explanation`
- 第 2 或第 3 轮可以带 `PROCESS_GUIDE`
- journey 不应直接跳到 `RECOMMENDATION.active`
- 应该最多进入 `COLLECT_MEDICAL_INPUTS.pre`，而不是过度推进

## Session 2：FAQ 穿插资料阶段，不应打断 progression

### 目的

验证：

- 进入资料阶段后，FAQ 仍能答
- 但 stage 不应该因为 FAQ 回退到 `EXPLAIN_PROCESS.active`

### 对话

1. 用户：
   `I have an eye problem and want to continue to the next step.`
2. 用户：
   `Before I upload anything, how long does this usually take?`
3. 用户：
   `Okay, then what information do you need next?`

### 预期

- 第 1 轮后，journey 应进入 `COLLECT_MEDICAL_INPUTS.pre` 或 `COLLECT_MEDICAL_INPUTS.active`
- 第 2 轮 FAQ 回答后，journey 仍保持在资料相关阶段
- 第 3 轮是 progression request，不应 502
- 第 3 轮应该明确告诉用户下一步需要的 medical inputs

## Session 3：问卷 resource 可用性与文案一致性

### 目的

验证：

- 当 `QUESTIONNAIRE` resource 暴露时，回复文案不会再说它不可用

### 对话

1. 用户：
   `I do not want to upload full records yet. Can you open the questionnaire for me?`
2. 用户：
   `If the questionnaire is available, show it to me now.`

### 预期

- 返回的 `resources` 中应包含 `QUESTIONNAIRE`
- 回复文案不能说：
  - 没有 questionnaire
  - questionnaire unavailable
  - I cannot see a questionnaire resource
- 文案应和当前暴露的 resource 保持一致

## Session 4：问卷提交后的 receipt 与 post 行为

### 目的

验证：

- 问卷提交后，系统是否承认已收到
- `COLLECT_MEDICAL_INPUTS.post` 是否至少在文案层成立
- journey 是否合理前进

### 前置

- 先完成问卷提交
- 必要时用前台或接口完成提交，再核对 `/api/patient/me`

### 对话

1. 用户：
   `Have you received my questionnaire?`
2. 用户：
   `What happens after you receive it?`
3. 用户：
   `Can we move to recommendations now?`

### 预期

- `/api/patient/me` 中 `medicalFormStatus` 应为 `SUBMITTED`
- 第 1 轮不能再否认 receipt
- 第 2 轮应有明显的 post-style 接收确认语义：
  - 已收到
  - 接下来会整理/进入下一步
- 第 3 轮如 truth 足够，应进入 recommendation 相关阶段

## Session 5：后续阶段再问 process explanation，不得回退

### 目的

验证：

- process explanation 在后续阶段仍可回答
- 但 journey 不会因此回退回 `EXPLAIN_PROCESS.active`

### 对话

1. 用户：
   `Why do you need this step before recommending hospitals?`
2. 用户：
   `Explain the process again briefly.`
3. 用户：
   `Okay, continue.`

### 预期

- 第 1、2 轮可以回答流程解释
- 可以附带 `PROCESS_GUIDE`
- 但 stage 应停留在当前更靠后的阶段，不应倒退
- 第 3 轮继续推进时，应从当前阶段往前，而不是重新从 explain 入口开始

## Session 6：人工接手后插 FAQ / 状态查询，不得回退

### 目的

验证：

- `human_help_request` 进入 `HUMAN_HANDOFF.pre`
- 后续 FAQ / status question 不会让 journey 回退

### 对话

1. 用户：
   `I want a human advisor to take over.`
2. 用户：
   `Before they contact me, can you explain what happens next?`
3. 用户：
   `Can you check my medical invitation status as well?`

### 预期

- 第 1 轮后，journey 应进入 `HUMAN_HANDOFF.pre`
- 第 2 轮可以是 process explanation
- 第 3 轮可以是 resource status question，并可带 `MEDICAL_INVITATION_STATUS`
- 第 2、3 轮之后，journey 仍不应回退到 `EXPLAIN_PROCESS.active`

## Session 7：hospital-aware FAQ grounding

### 目的

验证：

- FAQ grounding 会区分 `GENERAL_ONLY` 和 `HOSPITAL_AWARE`
- `HOSPITAL_AWARE` 不是 general FAQ 查不到后的 fallback

### 前置

- 需要 session 中已经有 active hospital context，或者先完成 recommendation 并选中一个 hospital

### 对话

1. 用户：
   `For this hospital specifically, what makes it a fit for my case?`
2. 用户：
   `What is this hospital's usual intake flow?`

### 预期

- FAQ grounding 应走 `HOSPITAL_AWARE`
- 回答应体现 active hospital 相关信息
- 不是泛泛的平台 FAQ

## Session 8：中间态 progression 稳定性

### 目的

专门复测之前出现过的这句：

- `What information do you need next?`

### 对话

1. 用户：
   `What information do you need next?`
2. 用户：
   `Tell me exactly what I should prepare.`

### 预期

- 不应出现 502
- 应识别为 progression / information collection 相关请求
- 回复应清楚说明下一步所需信息
- 若当前阶段允许，可附带 `QUESTIONNAIRE` 或 `MEDICAL_DOC_UPLOAD`

## 通过标准

如果这轮测试要判为“可以继续推进”，至少要满足：

- Session 3 通过：resource 与文案一致
- Session 4 通过：问卷 receipt 读取 truth
- Session 5 通过：后续阶段的 process explanation 不回退
- Session 6 通过：handoff 后不回退
- Session 8 通过：关键 progression 句子不再 502

## 输出文档

实际测试完成后，会再生成一份结果文档，逐 session 记录：

- 实际对话
- 实际 `journeySnapshot`
- 实际 `resources`
- 是否通过
- 如果失败，失败点和推测根因
