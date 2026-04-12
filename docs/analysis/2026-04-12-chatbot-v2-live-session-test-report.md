# Chatbot V2 Live Session Test Report

## 概览

本轮测试基于：

- CRM branch: `feature/phase-2bc`
- CRM commit: `b4653a7`
- 线上 CRM API: `https://crmapi.medicaltourismchina.health`
- 已更新的 composer app key: `app-SQkVBrzKy7AazvtVcSWLvAkw`
- classifier app key: 已配置
- FAQ grounding app key: 已配置

本轮按 [2026-04-11-chatbot-v2-session-test-plan.md](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/docs/analysis/2026-04-11-chatbot-v2-session-test-plan.md) 跑了 7 组真实 session：

- Session 1
- Session 2
- Session 3
- Session 4
- Session 5
- Session 6
- Session 8

Session 7 这轮没有单独执行，因为它依赖 active hospital context；当前这批 session 都是 fresh onboarding case，还没有进入 hospital-specific 语境。

## 结论

这轮结果可以概括成一句话：

- `B` 问题基本修好了
- `A` 还没有修好
- `C` 还没有修好
- 之前那句 `"What information do you need next?"` 的特定 502 已经消失
- 但更广义的 progression 类句子仍然会不稳定地 502

## 通过情况

### 已明显改善

1. 问卷 receipt 已对齐 truth
   在 Session 4 里，问卷提交后：
   - `/api/patient/me.medicalFormStatus = SUBMITTED`
   - 机器人回答：`Yes — your questionnaire has already been received...`
   这说明“已收到问卷”这条主问题已经不再盯着当前 `QUESTIONNAIRE` resource，而是开始承认 truth。

2. 后续阶段的 process explanation 不再直接回退到 `EXPLAIN_PROCESS.active`
   在 Session 5 里，问卷提交后当前 stage 已经是：
   - `RECOMMENDATION.active`
   然后再问：
   - `Why do you need this step before recommending hospitals?`
   - `Explain the process again briefly.`
   返回的 `journeySnapshot` 都保持在：
   - `RECOMMENDATION.active`
   这一点符合“后续阶段可以解释流程，但不能倒退”。

3. `"What information do you need next?"` 这句本身已经不再 502
   在 Session 8 里：
   - 第 1 轮 `What information do you need next?` 返回 200
   - 第 2 轮 `Tell me exactly what I should prepare.` 返回 200

### 仍未通过

1. `QUESTIONNAIRE` resource 与文案仍然打架
   Session 3 明确失败。
   当返回里已经有：
   - `resources = ["QUESTIONNAIRE"]`
   文案仍然说：
   - `no upload or questionnaire resource is exposed for this turn`
   这说明问题 A 仍然在线上存在。

2. handoff 后仍会回退
   Session 6 明确失败。
   第 1 轮：
   - `I want a human advisor to take over.`
   - `journeySnapshot = HUMAN_HANDOFF.pre`
   第 2 轮再问流程：
   - 掉到 `COLLECT_MEDICAL_INPUTS.pre`
   第 3 轮再问 invitation status：
   - 又掉到 `EXPLAIN_PROCESS.active`
   这说明问题 C 仍然在线上存在。

3. progression 类句子仍会出现 502
   虽然 Session 8 通过了，但其他 session 里多个 progression 句子仍然失败：
   - Session 1 第 3 轮：`If this makes sense, we can continue.` -> 502
   - Session 2 第 1 轮：`I have an eye problem and want to continue to the next step.` -> 502
   - Session 2 第 3 轮：`Okay, then what information do you need next?` -> 502
   - Session 4 第 3 轮：`Can we move to recommendations now?` -> 502
   - Session 5 第 3 轮：`Okay, continue.` -> 502

## 逐 Session 结果

### Session 1

目标：
- FAQ + 流程解释 + 轻推进

结果：
- 第 1 轮 200
  - `journeySnapshot = COLLECT_MEDICAL_INPUTS.pre`
  - resources:
    - `PROCESS_GUIDE`
    - `MEDICAL_DOC_UPLOAD`
    - `QUESTIONNAIRE`
    - `HUMAN_HANDOFF`
    - `MEDICAL_INVITATION_STATUS`
- 第 2 轮 200
  - 保持 `COLLECT_MEDICAL_INPUTS.pre`
- 第 3 轮 502
  - `If this makes sense, we can continue.`

判断：
- 部分通过
- FAQ / process explanation 能接住
- progression 句子不稳定

### Session 2

目标：
- FAQ 穿插资料阶段，不打断 progression

结果：
- 第 1 轮 502
  - `I have an eye problem and want to continue to the next step.`
- 第 2 轮 200
  - FAQ 可答
  - `journeySnapshot = COLLECT_MEDICAL_INPUTS.pre`
- 第 3 轮 502
  - `Okay, then what information do you need next?`

判断：
- 未通过
- progression 路径仍然是当前最不稳定的点之一

### Session 3

目标：
- 问卷 resource 可用性与文案一致性

结果：
- 第 1 轮 200
  - `resourceTypes = ["QUESTIONNAIRE"]`
  - 文案却说：
    - `I can’t open the questionnaire from here because no upload or questionnaire resource is exposed for this turn.`
- 第 2 轮 200
  - `resourceTypes = ["QUESTIONNAIRE"]`
  - 文案仍说：
    - `no questionnaire or upload resource is exposed for this turn`

判断：
- 明确失败
- 问题 A 仍然存在

### Session 4

目标：
- 问卷提交后的 receipt 与 post 行为

前置：
- 成功提交问卷
- `POST /api/patient/intake/:caseId/response` 返回 `201`
- `/api/patient/me.medicalFormStatus = SUBMITTED`
- `/api/patient/me.journeySnapshot = RECOMMENDATION.active`

结果：
- 第 1 轮 200
  - `Have you received my questionnaire?`
  - 回答：`Yes — your questionnaire has already been received...`
- 第 2 轮 200
  - `What happens after you receive it?`
  - 回答是通的，但比较泛
- 第 3 轮 502
  - `Can we move to recommendations now?`

判断：
- receipt 问题已修好
- `post` 语义有一点，但还不够完整
- progression 到 recommendation 的句子仍不稳定

### Session 5

目标：
- 后续阶段再问 process explanation，不得回退

前置：
- 已提交问卷
- 当前 truth 对应 recommendation 阶段

结果：
- 第 1 轮 200
  - `journeySnapshot = RECOMMENDATION.active`
- 第 2 轮 200
  - `journeySnapshot = RECOMMENDATION.active`
- 第 3 轮 502
  - `Okay, continue.`

判断：
- “解释流程不倒退” 这部分通过
- 但 progression 继续动作依旧不稳定

### Session 6

目标：
- handoff 后插 FAQ / 状态查询，不得回退

结果：
- 第 1 轮 200
  - `I want a human advisor to take over.`
  - `journeySnapshot = HUMAN_HANDOFF.pre`
- 第 2 轮 200
  - `Before they contact me, can you explain what happens next?`
  - 掉到 `COLLECT_MEDICAL_INPUTS.pre`
- 第 3 轮 200
  - `Can you check my medical invitation status as well?`
  - 又掉到 `EXPLAIN_PROCESS.active`

判断：
- 明确失败
- 问题 C 仍然在线

### Session 8

目标：
- 复测 `What information do you need next?`

结果：
- 第 1 轮 200
  - `journeySnapshot = COLLECT_MEDICAL_INPUTS.pre`
- 第 2 轮 200
  - 继续保持 `COLLECT_MEDICAL_INPUTS.pre`

判断：
- 这条特定句子当前通过
- 但它的回答仍然偏保守，更像 FAQ / process explanation，而不是更强的 progression

## 当前最重要的结论

### 1. 问卷 receipt 修好了

这一点现在可以明确确认：

- truth 已提交
- 回答承认已收到

这是这轮最大的正向结果。

### 2. resource 语义仍没和 composer 完全对齐

虽然我们已经把 `allowed_resources_json` 和 `truth_summary_json` 喂给了 composer，
但 Session 3 说明：

- composer 仍然会忽略当前实际暴露的 `QUESTIONNAIRE`
- 然后说“这个 turn 没暴露 questionnaire”

所以问题已经不是“完全没喂上下文”，而是：

- 规则还不够强
- 或者 prompt 里的冲突优先级仍然不对

### 3. handoff floor 还没真正锁住 live path

本地测试和 review 里这条修法是对的，但 live Session 6 说明：

- `chatbot_v2_floor` 这条逻辑还没有真正把线上后续轮次保住

所以这里不是“文案错”，而是：

- live routing / foundation rebuild / floor merge 仍有遗漏

### 4. 502 不再只是一句固定 prompt 的问题

之前我们盯的是：
- `What information do you need next?`

现在这句单独测通了。  
但其他 progression 句子仍炸，说明真实问题更像：

- progression family 整体仍有一类 live instability

不是只修一条句子就结束。

## 建议的下一步

最值得继续修的顺序我建议是：

1. 先修 `QUESTIONNAIRE` resource / 文案冲突
2. 再修 `HUMAN_HANDOFF.pre` live 回退
3. 再把 progression family 的 502 当成一组问题系统排查

如果只看这轮结果，当前系统还不能判为 “chatbot-v2 e2e 已完全通过”。

但已经可以明确说：

- 真相读取这条已经比之前稳很多
- 主要剩余问题已经收敛到更具体的 3 类，而不是整套链路都不通
