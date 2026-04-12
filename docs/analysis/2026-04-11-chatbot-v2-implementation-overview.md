# Chatbot V2 实现总览

## 1. 这份文档是干什么的

这份文档用来快速说明当前代码里 `chatbot v2` 是怎么落地的，重点回答 4 个问题：

1. 我们这次到底想把什么改掉
2. CRM、Dify、China 前台分别怎么实现
3. 一轮真实聊天消息是怎么流过去的
4. 现在代码已经完成了什么，还剩什么

这份总览对应的设计和计划文档是：

- `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`
- `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`

---

## 2. 这次 v2 的目标

这次不是在 v1 上继续补丁，而是新起一套更简单的聊天编排模型：

- `CRM backend` 是唯一编排器
- `Dify` 只负责理解和生成文案
- `China 前台` 只负责渲染消息和 resource，不自己推导流程

核心模型只有两层：

1. `Journey`
   - 只表示主流程推进到哪里
   - 当前代码里只存：
     - `currentStage`
     - `currentPhase`

2. `Resource`
   - 只表示当前前台可展示、可查询、可提交的 widget / 卡片
   - 不再把 widget 当成流程真相

这样做的目的，是解决 v1 里这几个问题：

- FAQ、流程推进、widget 展示混在一起
- chatbot 会因为 stale state 反复显示 questionnaire
- 前台 block 和 backend truth 经常不一致
- Dify 容易越权决定“下一步是什么”

---

## 3. v2 的目录位置

### 3.1 CRM

新的 v2 代码主要放在这些位置：

- `packages/shared/validation/src/chatbot-v2/`
- `packages/application/src/services/chatbot-v2/`
- `apps/api/src/routes/chatbot-v2-context.ts`
- `apps/api/src/routes/chatbot.routes.ts`
- `apps/api/src/routes/patient-widget-starter.ts`

### 3.2 Dify

新的 workflow 文件单独放了一份：

- `dify-config/medora-ai-chatbot-v2.dsl.yml`

### 3.3 China 前台

前台新的 v2 渲染代码也单独放在一个新目录：

- `src/components/chat-v2/`

主要文件：

- `src/components/chat-v2/ChatV2MessageResources.tsx`
- `src/components/chat-v2/resources/registry.tsx`
- `src/components/chat-v2/resources/types.ts`

---

## 4. Journey 模型

当前 v2 的 schema 在：

- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`

### 4.1 Stage

当前定义的 stage 是：

- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `RECOMMENDATION`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

### 4.2 Phase

当前 phase 是：

- `active`
- `pre`
- `post`

说明：

- 代码层面 phase 是统一枚举
- 但实际设计上，`EXPLAIN_PROCESS` 主要只用 `active`
- 其他 stage 才会更常用到 `pre / active / post`

### 4.3 Resource Status

当前 resource 状态被压缩成 3 个：

- `available`
- `submitted`
- `failed`

这正是之前设计里定下来的“极简状态模型”。

---

## 5. Resource 模型

当前 schema 中定义的 resourceType 有：

- `PROCESS_GUIDE`
- `MEDICAL_DOC_UPLOAD`
- `QUESTIONNAIRE`
- `HOSPITAL_RECOMMENDATION`
- `PACKAGE_RECOMMENDATION`
- `ONLINE_CONSULT_BOOKING`
- `HUMAN_HANDOFF`
- `MEDICAL_INVITATION_STATUS`

这意味着当前 v2 已经支持两类 resource：

1. 推进型 resource
   - `MEDICAL_DOC_UPLOAD`
   - `QUESTIONNAIRE`
   - `HOSPITAL_RECOMMENDATION`
   - `PACKAGE_RECOMMENDATION`
   - `ONLINE_CONSULT_BOOKING`
   - `HUMAN_HANDOFF`

2. 查询型 resource
   - `MEDICAL_INVITATION_STATUS`

后面要继续扩展 `ticket status / payment status / logistics status`，也建议继续走同一套 resource registry。

---

## 6. CRM 里最核心的几个服务

### 6.1 `JourneyEngineService`

文件：

- `packages/application/src/services/chatbot-v2/journey-engine.service.ts`

作用：

- 根据 truth 推导当前 `journeySnapshot`
- 在少量明确事件下推进 journey

当前它做两件事：

1. `deriveSnapshot(truth)`
   - 从 truth 推导出当前 stage/phase
   - 例如：
     - `humanHandoffActive = true` -> `HUMAN_HANDOFF.active`
     - `medicalInputsStarted = true` 且还未提交 -> `COLLECT_MEDICAL_INPUTS.active`
     - 没有任何推进迹象 -> `EXPLAIN_PROCESS.active`

2. `advanceSnapshot(current, event)`
   - 只处理非常少的显式推进事件
   - 当前只处理：
     - `START_MEDICAL_INPUTS`
     - `REQUEST_HUMAN_HANDOFF`

这和 v1 最大的不同是：

- v2 不再维护一大堆“下一步缓存字段”
- 而是尽量从 truth 重新算当前 stage

### 6.2 `RequestClassifierService`

文件：

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`

作用：

- 把用户当前这一轮消息归类成结构化请求

当前分类包括：

- `faq`
- `process_explanation`
- `progression_request`
- `resource_request`
- `resource_status_question`
- `human_help_request`

它的作用不是决定流程，而是先把“用户在干什么”归类好，后面再交给 orchestrator 判断这轮允许什么。

### 6.3 `ResourceRegistryService`

文件：

- `packages/application/src/services/chatbot-v2/resource-registry.service.ts`

作用：

- 统一注册所有 resource
- 根据当前 journey 和 truth 决定哪些 resource 可见
- 给每个 resource 生成：
  - `resourceId`
  - `status`
  - `stageBinding`
  - `visibility`
  - `payload`
  - `actions`

当前实现要点：

- `PROCESS_GUIDE` 是全局可见
- `HUMAN_HANDOFF` 是全局可见
- `MEDICAL_INVITATION_STATUS` 是全局可见
- 其余推进型 resource 基本都是 `journey` 可见
- `pre` phase 会被归一化到 `active` 来算资源可见性

### 6.4 `ConversationOrchestratorService`

文件：

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`

作用：

- 把 classifier、journey engine、resource registry 串起来
- 生成这轮真正给 Dify 和前台用的 v2 对话上下文

输出包括：

- `requestClass`
- `responseIntent`
- `allowedResources`
- `journeyUpdate`
- `resourceUpdates`

它的核心逻辑是：

1. 先 classify 用户消息
2. 先算当前可用 resource
3. 判断这轮是否要触发轻量的 journeyUpdate
4. 再算更新后的可用 resource
5. 如果用户明确点了某种 resource，就优先返回目标 resource
6. 否则返回当前整个允许集合

这就是 v2 “CRM 先定边界，Dify 只能在边界内说话”的核心实现。

---

## 7. CRM 路由是怎么接进去的

### 7.1 `chatbot-v2-context.ts`

文件：

- `apps/api/src/routes/chatbot-v2-context.ts`

这是 v2 在 API 层最关键的桥接文件。

它主要负责两件事：

1. `buildChatbotV2TurnContext(...)`
   - 在一轮消息发给 Dify 之前，先构建 `preTurn`
   - 输入来源：
     - `getAiPolicyContext`
     - 当前 session 的 `status_snapshot`
     - `chatbot_v2` / `chatbotV2` foundation context
   - 输出：
     - `preTurn.journeySnapshot`
     - `preTurn.resources`
     - `preTurn.requestClass`
     - `preTurn.responseIntent`

2. `buildChatbotV2PostTurnContext(...)`
   - Dify 回复回来后，再根据刷新后的 truth 重算一次 post-turn context
   - 用来保证 assistant message 最终落库的 `chatbotV2` 是更靠近真实状态的版本

这里很重要的一点是：

- v2 同时区分了 `preTurn` 和 `postTurn`
- 这样可以避免 “给 Dify 的上下文” 和 “最终写入 assistant metadata 的上下文” 打架

### 7.2 `/api/v2/chatbot/chat`

文件：

- `apps/api/src/routes/chatbot.routes.ts`

现在这条路由里的 v2 关键流程是：

1. 先构建 `chatbotV2Turn`
2. 创建 user message 和 assistant draft message
3. 调 Dify 时把 `chatbotV2Turn.preTurn` 作为 `inputs.chatbotV2` 发过去
4. Dify 返回后，根据刷新的 session status 再构建 `postTurnChatbotV2`
5. 把 `postTurnChatbotV2` 写进 assistant message metadata
6. 最终对前台返回：
   - `journeySnapshot`
   - `resources`
   - `metadata.chatbotV2`

也就是说，现在 v2 已经真正接进聊天主路由了，不只是独立服务骨架。

### 7.3 `patient-widget-starter.ts`

文件：

- `apps/api/src/routes/patient-widget-starter.ts`

这个入口负责 widget chat 的首轮启动消息。

当前它也已经接上 v2：

1. 先 build `chatbotV2Turn`
2. 调 Dify 时把 `chatbotV2.preTurn` 作为 start inputs
3. Dify 回来后再构建 `postTurnChatbotV2`
4. 写入 starter assistant message metadata

所以 widget 的首轮 opener 也已经开始走 v2 contract。

### 7.4 `/api/patient/me`

文件：

- `packages/application/src/use-cases/patient-auth/get-patient-session-state.use-case.ts`

当前这里已经做了两件关键事：

1. `journeySnapshot` 已经加入 patient session state
2. `chatbotOrchestrationState` 已经被瘦身，只保留：
   - `conversationSummary`

这和我们之前的状态收敛目标是一致的：

- 不再向前台暴露 `pendingOffer`
- 不再暴露 `pendingQuestion`
- 不再暴露 `lastNextAction`

---

## 8. Dify v2 DSL 是怎么弄的

文件：

- `dify-config/medora-ai-chatbot-v2.dsl.yml`

当前这份 DSL 是一份独立的 v2 workflow，不再复用 v1 的主 DSL。

### 8.1 总体流程

当前 graph 是：

- `start`
- `parse_chatbot_v2_context`
- `response_composer_v2`
- `normalize_response_v2`
- `writeback_http`
- `final_answer`

### 8.2 每个节点的作用

#### `start`

接收 CRM 发来的 start inputs，重点是：

- `chatbotV2`
- `sessionId`
- `assistantMessageId`
- `hospitalType`
- `currentStatus`
- `conversationSummary`
- `pageContext`
- `attachments`

其中最关键的是：

- `chatbotV2`
  - 这是 CRM 先算好的 journey/resource context
  - v2 的 DSL 主要就是围绕它工作

#### `parse_chatbot_v2_context`

这是一个 code node。

主要做的事情：

- 从 `chatbotV2` 中解析出：
  - `request_class`
  - `response_intent`
  - `current_stage`
  - `current_phase`
  - `allowed_resource_types`
  - `allowed_next_action_hints`

它还做了一个很重要的事：

- 用 `RESOURCE_TO_HINTS` 把 resourceType 映射成保守的 next action hints

例如：

- `PROCESS_GUIDE` -> `EXPLAIN_MEDICAL_TRAVEL_PROCESS`
- `MEDICAL_DOC_UPLOAD` -> `REQUEST_DOC_UPLOAD`
- `ONLINE_CONSULT_BOOKING` -> `INVITE_ONLINE_CONSULT`
- `HUMAN_HANDOFF` -> `HUMAN_HANDOFF`

这个节点的意义是：

- Dify 不再自己无限发挥决定流程
- 它只能消费 CRM 提前算好的资源边界和 hint

#### `response_composer_v2`

这是 LLM 节点。

它的职责应该理解成：

- 在 CRM 给定的 stage / phase / allowed resources 范围内生成自然语言回复

也就是说它现在应该做的是：

- 写文案
- 解释当前下一步
- 包装 FAQ 或解释

而不是：

- 决定正式进入哪一个 stage
- 决定偷偷弹哪个不允许的 widget

#### `normalize_response_v2`

这是 code 节点。

它的职责是：

- 对 LLM 输出做结构化修正
- 避免 writeback 直接吃到不合法输出

这一步在 v2 里很关键，因为我们明确不想再让 LLM 输出直接驱动系统状态。

#### `writeback_http`

这是 HTTP 节点。

它负责把这轮 Dify 的结果写回 CRM。

当前意义是：

- assistant message 的 writeback
- 保守地记录 policy decision
- 配合 `assistantMessageId` 做幂等写入

#### `final_answer`

返回最终回答给上游调用方。

### 8.3 v2 DSL 和 v1 的区别

当前 v2 已经明显和 v1 分离：

- 不再走 v1 那套大而杂的 action gate
- 不再继续依赖旧的 recommendation / package / questionnaire 冗余状态链
- 重点变成消费 CRM 给出的 `chatbotV2` context

不过按当前代码看，v2 DSL 还是偏“最小 scaffold”：

- 它已经能接 v2 context
- 但资源动作、更多查询型 resource、更多专用 prompt 还没有完全扩展

---

## 9. China 前台是怎么接的

### 9.1 v2 resource renderer

文件：

- `src/components/chat-v2/ChatV2MessageResources.tsx`
- `src/components/chat-v2/resources/registry.tsx`

当前实现方式很简单：

1. assistant message 如果带了 `resources`
2. `ChatV2MessageResources` 就逐个渲染
3. 具体怎么渲染由 `registry.tsx` 决定

当前 registry 的特点：

- 先注册了所有已知 v2 resourceType
- 暂时统一用 `ResourceShell` 占位渲染
- 未知 resourceType 会走 `UnknownResourceShell`
- `rolloutReadyResourceTypes` 目前还是空集合，说明这里还保留了渐进 rollout 的空间

### 9.2 history / restore 的兼容处理

前台聊天恢复相关逻辑主要在：

- `src/components/chat/PatientEntryWindow.tsx`
- `src/components/chat/PatientChatComposer.tsx`

目前已经做的事情：

1. 发送新消息后，assistant reply 会优先使用 top-level：
   - `response.resources`
   - `response.journeySnapshot`

2. 如果 top-level 没有，再 fallback 到：
   - `metadata.resources`
   - `metadata.journeySnapshot`

3. history restore 也做了同样的 fallback

这部分是必要的，因为：

- 线上 rollout 期间，历史消息不一定都已经是新 shape
- 前台需要同时兼容 top-level 和 metadata

---

## 10. 一轮聊天消息现在怎么走

这里用最简单的话串一下全链路。

### 10.1 用户发消息

前台把消息发到：

- `/api/v2/chatbot/chat`

### 10.2 CRM 先构建 v2 上下文

CRM 会先通过 `buildChatbotV2TurnContext(...)` 算出：

- 当前 `journeySnapshot`
- 当前 `allowed resources`
- 这轮 `requestClass`
- 这轮 `responseIntent`

### 10.3 CRM 再调 Dify

CRM 把 `chatbotV2.preTurn` 放进 Dify start inputs：

- `inputs.chatbotV2 = chatbotV2Turn.preTurn`

### 10.4 Dify 只在这个边界里生成回答

Dify 的 v2 workflow 会：

1. parse `chatbotV2`
2. 得到当前 stage / phase / allowed resources
3. 生成一条受约束的 assistant 文案
4. normalize
5. writeback

### 10.5 CRM 再根据刷新后的 truth 计算 post-turn

Dify 回来后，CRM 还会再跑一次：

- `buildChatbotV2PostTurnContext(...)`

这样最终返回给前台、写进 assistant metadata 的，是更靠近真实状态的 post-turn 结果。

### 10.6 前台渲染

前台收到：

- `answer`
- `journeySnapshot`
- `resources`
- `metadata`

然后：

1. 文本正常显示
2. resource 通过 `chat-v2` registry 渲染
3. 历史消息恢复时，继续用同一套字段

---

## 11. 现在这套代码已经完成了什么

按当前仓库代码看，已经完成的事情有：

1. v2 schema 和 shared validation 已经建立
2. v2 的 journey engine / request classifier / resource registry / conversation orchestrator 已经落地
3. API 层已经有 `chatbot-v2-context.ts` 作为 pre-turn / post-turn 桥接
4. `/api/v2/chatbot/chat` 已经真的把 `chatbotV2` 发给 Dify
5. `patient-widget-starter` 已经开始走 v2 context
6. `/api/patient/me` 已经返回 `journeySnapshot`
7. `chatbotOrchestrationState` 已经瘦身到只剩 `conversationSummary`
8. Dify v2 独立 DSL 文件已经建立
9. China 前台已经有独立 `chat-v2/` 目录和 resource registry
10. 前台 history / restore 已经补了 top-level + metadata 双兼容

---

## 12. 现在还没完全做完的地方

按当前代码状态，下面这些还属于“下一步继续完善”的内容：

1. `chat-v2` 前台 renderer 目前还是 shell 级占位
   - 还没有把每个 resource 做成真正完整的 widget 交互组件

2. 查询型 resource 现在只正式放进了一个：
   - `MEDICAL_INVITATION_STATUS`
   - 其余 `ticket status / payment status / logistics status` 还没继续扩展

3. resource update / action 的统一接口体系还需要继续推进
   - 当前 v2 重点先完成了 message + context + render contract

4. v2 DSL 现在是最小可用 workflow
   - 它已经隔离于 v1
   - 但还不是“所有业务动作都 fully migrated”的最终形态

---

## 13. 你现在看代码时，建议按什么顺序看

如果你想最快理解这套实现，我建议按这个顺序看：

1. 先看设计和实施计划
   - `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`
   - `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`

2. 再看 schema
   - `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`

3. 再看 CRM 核心服务
   - `packages/application/src/services/chatbot-v2/types.ts`
   - `packages/application/src/services/chatbot-v2/journey-engine.service.ts`
   - `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
   - `packages/application/src/services/chatbot-v2/resource-registry.service.ts`
   - `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`

4. 再看 API 路由接线
   - `apps/api/src/routes/chatbot-v2-context.ts`
   - `apps/api/src/routes/chatbot.routes.ts`
   - `apps/api/src/routes/patient-widget-starter.ts`
   - `packages/application/src/use-cases/patient-auth/get-patient-session-state.use-case.ts`

5. 然后看 Dify v2
   - `dify-config/medora-ai-chatbot-v2.dsl.yml`

6. 最后看 China 前台
   - `src/components/chat-v2/ChatV2MessageResources.tsx`
   - `src/components/chat-v2/resources/registry.tsx`
   - `src/components/chat/PatientEntryWindow.tsx`
   - `src/components/chat/PatientChatComposer.tsx`

---

## 14. 一句话总结

当前这套 `chatbot v2` 已经不是在 v1 上继续堆字段，而是正式切成了：

- CRM 负责 `journey + allowed resources`
- Dify 负责“在边界内怎么说”
- 前台负责 `resource renderer`

而且代码已经在这 3 层都落下了独立的 v2 目录和 v2 文件，只是前台 widget 细化和更多 resource 扩展还要继续做。
