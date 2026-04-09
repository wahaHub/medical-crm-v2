# 云端 Dify 多轮 Session 实测报告

日期：2026-04-08

环境：
- CRM API: `https://crmapi.medicaltourismchina.health`
- 云端 Dify app key: `app-p1WVvYqulwAZaFjkMsIK43HI`
- 测试方式：真实 patient onboarding + 真实 widget chat session + 真实问卷提交

## 结论

这轮上线后，系统已经通过了两类关键修复：

1. CRM truth consolidation 已生效
- `/api/patient/me` 中 `chatbotOrchestrationState` 线上实测只剩 `conversationSummary`
- 不再出现旧的 `pendingOffer / pendingQuestion / lastNextAction`

2. 问卷提交后的真实性链路已恢复
- 问卷提交接口返回 `201`
- `/api/patient/me` 立刻显示 `medicalFormStatus = SUBMITTED`
- 机器人在“你有没有收到我填写的问题表”场景下，能正确回答“已收到”

但系统还有一个明显未完全解决的问题：

- 当用户开始逼近“医院推荐 / 医院方向 / 后面怎么帮我选医院”这类意图时，云端 Dify 仍然会多次回到 `REQUEST_DOC_UPLOAD + QUESTIONNAIRE_MODAL_TRIGGER`
- 即使用户明确说了“不想填表”或者“不想上传资料”，这个动作仍然会被触发

所以本轮整体判断是：

- 数据真实性：`通过`
- 冗余状态清理：`通过`
- “拒绝填表后不再强推问卷”产品行为：`部分通过，仍有失败场景`

## 测试总览

| Session | 主题 | 结果 |
| --- | --- | --- |
| Session A | 一般咨询 -> 明确拒绝填表 -> 继续问流程/医院帮助 | 部分通过 |
| Session B | 先聊天 -> 提交问卷 -> 追问是否收到 -> 要求继续方向 | 通过 |
| Session C | 强压医院推荐，但明确拒绝填表/上传资料 | 失败 |
| Direct Dify Probe | 直连云端 Dify app | 通过，且确认新 key 生效 |

## Session A：一般咨询 + 明确拒绝填表

Session ID：
- `widget-chat:7413cd11-bf9c-4dbc-9800-4579704d465d:1de27186-fdf9-43f3-80ab-3637b8e17a20`

初始 welcome message：
- `nextAction = ANSWER_FAQ`
- `blocks = []`
- 结论：`通过`

多轮结果：

| Turn | 用户问题 | 返回动作 | Blocks | 判断 |
| --- | --- | --- | --- | --- |
| 1 | 我想去中国看病，你们有啥服务能帮我？ | `ANSWER_FAQ` | `[]` | 通过 |
| 2 | 我不想填表，我现在眼睛有点问题，想去看眼睛。 | `ANSWER_FAQ` | `[]` | 通过 |
| 3 | 我不想填表，你不要再给我显示 Open questionnaire 了，直接告诉我下一步。 | `ANSWER_FAQ` | `[]` | 通过 |
| 4 | 那你先告诉我去中国看眼科的一般流程。 | `EXPLAIN_MEDICAL_TRAVEL_PROCESS` | `PROCESS_MODAL_TRIGGER` | 通过 |
| 5 | 如果后面我需要选医院，你们会怎么帮我？ | `REQUEST_DOC_UPLOAD` | `QUESTIONNAIRE_MODAL_TRIGGER` | 失败 |

关键观察：
- 前 4 轮表现已经明显好转，尤其是用户明确说“不想填表”后，没有继续硬塞问卷
- 但只要问题开始靠近“医院推荐/医院帮助”，策略仍会回到 `REQUEST_DOC_UPLOAD`
- 这说明当前问题已经不是旧的 `pendingQuestion` stale state，而是云端 Dify / policy 本身仍然把“推荐前要先补资料”判得太激进

## Session B：提交问卷后的真实性验证

Session ID：
- `widget-chat:9db5ffbf-6123-4936-9162-0883dabc837c:595cdc80-bd05-44b7-8407-78fabaa370dd`

问卷提交结果：
- `templateId = fd23f3a7-fa09-4f04-adfa-05524be36470`
- `submitStatus = 201`
- `responseId = b2c2b830-9b57-4a55-a5f4-8c5a64cd68dc`
- `/api/patient/me.medicalFormStatus = SUBMITTED`
- `/api/patient/me.medicalFormResponseId = b2c2b830-9b57-4a55-a5f4-8c5a64cd68dc`
- `/api/patient/me.chatbotOrchestrationState = { "conversationSummary": "" }`

历史记录中还能看到系统消息：
- `eventType = QUESTIONNAIRE_SUBMITTED`
- 内容：`Your medical intake form has been submitted successfully. The care team will review it shortly.`

多轮结果：

| Turn | 用户问题 | 返回动作 | Blocks | 判断 |
| --- | --- | --- | --- | --- |
| 1 | 我现在眼睛有点问题，想去中国看眼科。 | `ANSWER_FAQ` | `[]` | 通过 |
| 2 | 我先不想填表，你先告诉我下一步。 | `ANSWER_FAQ` | `[]` | 通过 |
| 3 | 如果我要配合你们，我现在应该准备什么？ | `ANSWER_FAQ` | `[]` | 通过 |
| 4 | 你查看一下你有没有收到我填写的问题表？ | `ANSWER_FAQ` | `[]` | 通过 |
| 5 | 那你根据我填的情况继续给我后续方向。 | `ANSWER_FAQ` | `[]` | 基本通过 |

关键观察：
- 这组最重要，因为它正对你之前提的第 4 个线上问题
- 现在机器人已经能正确“认账”，不会再说“没看到你提交”
- 说明 CRM truth 和聊天侧读取已经重新对齐

还剩一点体验上的不足：
- “根据我填的情况继续给我后续方向”这轮虽然不再弹问卷，但回答仍偏泛化
- 它承认表单已收到，但还没有把“眼科方向/后续推进”说得足够具体

## Session C：强压医院推荐，但不填表/不传资料

Session ID：
- `widget-chat:abbf3db3-cbae-4da4-8fe0-7f1fa63e13d7:fc5bbfd1-f429-42a6-a4b0-bc909847b651`

初始 welcome message：
- `nextAction = ANSWER_FAQ`
- `blocks = []`

多轮结果：

| Turn | 用户问题 | 返回动作 | Blocks | 判断 |
| --- | --- | --- | --- | --- |
| 1 | 我想直接找中国的眼科医院，你们先给我推荐。 | `REQUEST_DOC_UPLOAD` | `QUESTIONNAIRE_MODAL_TRIGGER` | 失败 |
| 2 | 我先不填表，也不想上传资料，你能先告诉我应该怎么判断医院方向吗？ | `REQUEST_DOC_UPLOAD` | `QUESTIONNAIRE_MODAL_TRIGGER` | 失败 |
| 3 | 如果只是先了解医院方向，不要让我立刻填表。 | `REQUEST_DOC_UPLOAD` | `QUESTIONNAIRE_MODAL_TRIGGER` | 失败 |
| 4 | 那你告诉我我现在最小下一步是什么。 | `REQUEST_DOC_UPLOAD` | `QUESTIONNAIRE_MODAL_TRIGGER` | 失败 |
| 5 | 如果我准备好了资料，你们下一步能怎么推进？ | `EXPLAIN_MEDICAL_TRAVEL_PROCESS` | `PROCESS_MODAL_TRIGGER` | 部分通过 |

关键观察：
- 这是当前最稳定的失败路径
- 只要用户一上来就逼近“医院推荐”，即使明确表态“不填表、不上传资料”，机器人还是会继续给问卷控件
- 这和 Session A Turn 5 的失败是同一类问题

这说明当前云端 Dify / policy 的真实行为是：
- 一般咨询、流程咨询：已经比较稳
- 一旦语义被判成 `CONSULT / recommendation pressure`：还是会回落到 `REQUEST_DOC_UPLOAD`

## Direct Dify Probe

我还直连了云端 Dify：
- Base URL: `https://ai.medicaltourismchina.health/v1`
- App key: `app-p1WVvYqulwAZaFjkMsIK43HI`

返回结果：
- HTTP `400`
- `message = "sessionId is required in input form"`

这个结果反而是好信号，说明两件事：
- 新 app key 是生效的
- 云端 workflow 已经发布并在线
- 它明确要求 CRM 传入 `sessionId`，也就是当前生产 workflow 确实是 CRM 集成型 workflow，不是旧的无状态 demo app

## 最终判断

现在可以明确分成两层：

1. 已修好
- CRM v2 部署已生效
- 新 Dify key 已接入 CRM
- `/api/patient/me` truth contract 已清理
- 问卷提交后的真实性链路已恢复

2. 仍需继续修
- “用户拒绝填表/拒绝上传资料，但仍想先了解医院方向”时，云端 Dify 依然过度触发 `REQUEST_DOC_UPLOAD`
- 当前失败根因更像是 workflow/policy 行为本身，而不是 CRM state 漂移

## 我建议的下一步

优先继续改这几个点：
- Dify workflow 中 recommendation / consult 相关节点的 gating
- CRM `action-planner` 对 `REQUEST_DOC_UPLOAD` 的触发条件
- “用户明确拒绝填表”时的降级策略

目标应该是：
- 用户拒绝填表时，允许继续给“方向性回答”
- 只有在真正进入 case progression 或需要结构化资料时，才显示 questionnaire
