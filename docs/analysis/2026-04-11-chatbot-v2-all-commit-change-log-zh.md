# Chatbot V2 全部相关 Commit 改动总表

## 目的

这份文档把本轮 `chatbot-v2` 迁移里你前面列出来的全部相关 commits，按：

- `commit`
- 改动文件
- 具体改动逻辑

统一整理成一份中文总表，方便你快速审阅。

范围包括两类：

1. 实现类 commits
2. architecture / spec / plan 类 commits

---

## 当前结论

先回答你最关心的那个问题：

**现在这轮可以收口了。**

原因是：

- `45f6e07` 已经修掉了上一轮 review 里最实质的那个问题
- classifier 现在不再 silently fallback 到 composer app
- 现在只有明确配置了 `DIFY_CLASSIFIER_APP_API_KEY`，才会创建 `difyClassifierApi`
- 否则 `chatbot-v2` 分类阶段会显式报错，而不是悄悄打到错误的 Dify app

所以从这轮 `chunk 1-8 + classifier dedicated config fix` 的角度看，**主 blocker 已经关掉了**。

我这里仍然认为有两个非阻塞项可以后续再优化，但它们不是这轮必须拦住上线/收口的问题：

- FAQ grounding 现在对所有 `faq` 和 `process_explanation` 都会触发，偏保守，可能会多一点延迟/成本
- plan 里的 Vitest 命令示例已经和当前仓库实际跑法有一点漂移

---

## 实现类 Commits

## `b2f30c1` `Implement chatbot v2 classifier chunk 1`

对应 chunk：

- Chunk 1 起步
- 同时也提前落了一部分 Chunk 2 / Chunk 4 的生产逻辑

改动文件与具体逻辑：

- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`
  - 在计划文档里标记 chunk 1 的实现推进状态。

- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`
  - 同步了 classifier 设计文档，让实现和 spec 的字段口径一致。

- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
  - 新增 `ChatbotV2RequestClassSchema`
  - 新增 `ChatbotV2ClassifierInputSchema`
  - 新增 `ChatbotV2ClassifierResultSchema`
  - 首次把 `requestClass / targetResourceTypes / includeProgressionFollowUp` 变成共享 schema
  - 加入了 `FAQ classifications must not target resources`
  - 加入了 `Only faq and process_explanation may include progression follow-up`
  - 加入了 `targetResourceTypes must be unique`

- `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`
  - 对上述 classifier schema 增加测试
  - 开始把“分类输出必须是结构化合同”这件事用测试锁住。

- `packages/application/src/services/chatbot-v2/types.ts`
  - 新增 `ChatbotV2RequestClass`
  - 新增 classifier input / output 相关类型
  - 让 application 层开始显式承接 classifier 的结构化输入输出。

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - 这一版还没有彻底删掉本地 classifier，但已经支持通过 `input.classification` 注入分类结果
  - 新增 `includeProgressionFollowUpAccepted`
  - 开始把“是否接受 progression follow-up”交给 CRM orchestrator 决策
  - `computeJourneyUpdate()` 开始考虑 `includeProgressionFollowUpAccepted`

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 增加针对 classifier 注入模式的编排测试
  - 开始覆盖 FAQ + progression follow-up 这类组合输入。

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
  - 旧的 rule-based classifier 还在
  - 但开始被改造成兼容桥接层，返回新的结构化结果形状。

- `packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts`
  - 从“验证关键词匹配是否聪明”转成“验证兼容桥接是否返回新 shape”
  - 旧的 substring / keyword 行为测试被大量删掉。

---

## `0126d6a` `Add chatbot v2 classifier contract scaffolding`

对应 chunk：

- Chunk 2

改动文件与具体逻辑：

- `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`
  - 微调 classifier contract test 的 scaffolding
  - 让测试描述和后面真正要 enforce 的规则对齐。

---

## `167d460` `Tighten chatbot v2 classifier result schema`

对应 chunk：

- Chunk 2

改动文件与具体逻辑：

- `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts`
  - 进一步收紧 classifier result 规则
  - 额外限制 `process_explanation` 只能指向 `PROCESS_GUIDE`
  - 额外限制 `progression_request` 不能带具体资源
  - 额外限制 `resource_request` / `resource_status_question` 不能为空资源列表
  - 额外限制 `human_help_request` 若带资源，只能带 `HUMAN_HANDOFF`

- `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts`
  - 为上述收紧规则补对应测试。

---

## `b2dd82f` `Tighten classifier contract follow-up handling`

对应 chunk：

- Chunk 2 / Chunk 4 之间的收口

改动文件与具体逻辑：

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - 收紧 `includeProgressionFollowUp` 的接受逻辑
  - 只有 `faq` 和 `process_explanation` 才能带这个信号
  - 并且由 orchestrator 再决定当前阶段是否接受。

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 增加 follow-up 接受 / 不接受的测试分支。

---

## `c2a2f2e` `Add chatbot v2 LLM classifier service`

对应 chunk：

- Chunk 3

改动文件与具体逻辑：

- `packages/application/package.json`
  - 新增 `@medical-crm/validation` 依赖
  - 目的是让 application 层可以直接引用共享 classifier schema 做输入输出校验。

- `packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts`
  - 新建 LLM classifier adapter
  - 先用 `ChatbotV2ClassifierInputSchema` 校验输入
  - 再调用 `gateway.classify(...)`
  - 最后用 `parseClassifierResult(...)` 把结果转成结构化类型
  - 允许三种结果来源：
    - 直接返回 structured object
    - Dify `answer` 里包 JSON
    - Dify metadata 里放 `classifierResult`
  - 如果结果不符合 schema，直接抛错 `Invalid classifier result payload`

- `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`
  - 覆盖 direct structured result
  - 覆盖 `answer` 中 JSON
  - 覆盖 metadata 中 classifierResult
  - 覆盖 invalid payload 抛错。

- `packages/application/src/index.ts`
  - 导出 `LlmRequestClassifierService`
  - 导出 `parseClassifierResult`
  - 导出新的 classifier input 相关类型。

---

## `7e256f9` `Wire chatbot v2 classifier service`

对应 chunk：

- Chunk 3

改动文件与具体逻辑：

- `.env.example`
  - 大幅重写本地环境模板
  - 在 Dify 部分加入 `DIFY_CLASSIFIER_APP_API_KEY`
  - 把 classifier app config 明确暴露出来。

- `apps/api/src/composition-root.ts`
  - 新增 `difyClassifierApi?: DifyApiClientService`
  - 创建独立的 `difyClassifierApiClient`
  - 这一版的 key 选择逻辑是：
    - `DIFY_CLASSIFIER_APP_API_KEY`
    - 否则 `DIFY_APP_API_KEY`
    - 否则 `DIFY_API_KEY`
  - 这一步把 dedicated classifier client 接到了服务容器里。

- `apps/api/src/__tests__/composition-root.test.ts`
  - 补充 composition root 对 classifier client 的构造测试。

说明：

- 这一步是把 classifier client 接上了
- 但也埋下了后面 reviewer 抓到的那个问题：
  - classifier client 当时仍然会 fallback 到 composer app key

---

## `8db67a1` `Clarify classifier handoff targeting contract`

对应 chunk：

- Chunk 4 的补丁

改动文件与具体逻辑：

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
  - 在 classifier workflow 里明确 handoff targeting 语义
  - 强化 `human_help_request` 的 contract 表达。

- `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`
  - 补对应 contract test，确保 DSL 的 handoff 表达不漂移。

---

## `adca336` `Focus handoff requests in orchestrator`

对应 chunk：

- Chunk 4

改动文件与具体逻辑：

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - 增加 `resolveImplicitTargetedResources(...)`
  - 当 classifier 返回 `human_help_request`，即使没显式 target `HUMAN_HANDOFF`，也会从 projected resources 里把 handoff 资源挑出来
  - 避免“用户明确要人工，但前端拿不到 handoff resource”的问题

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 为“有无 `HUMAN_HANDOFF` hint 时的人工请求”补测试。

---

## `99976f6` `Add chatbot v2 classifier Dify workflows`

对应 chunk：

- Chunk 5

改动文件与具体逻辑：

- `dify-config/medora-ai-chatbot-v2-classifier.dsl.yml`
  - 新建 dedicated classifier workflow
  - 只有 `start -> classifier_llm -> normalize_classifier_output -> final_answer`
  - 输入只接受：
    - `recentMessages`
    - `conversationSummary`
    - `journeySnapshot`
    - `allowedResourceHints`
  - 明确禁止在 classifier workflow 里做 composer / writeback
  - 用 normalize node 把 LLM 结果修正成 strict JSON contract。

- `apps/api/src/__tests__/dify-classifier-v2.contract.test.ts`
  - 锁 classifier DSL 的输入合同、节点结构、prompt 约束、输出字段。

- `dify-config/medora-ai-chatbot-v2.dsl.yml`
  - 把 composer workflow 调整为“消费 classifier/orchestrator 输出”
  - 增加对 `includeProgressionFollowUp` 的消费
  - 明确 composer 只能在 allowed next-action hints 范围内说下一步
  - 强化“先回答当前问题，再决定要不要带一点 progression follow-up”

- `apps/api/src/__tests__/dify-workflow-v2.contract.test.ts`
  - 更新 composer contract test，保证它不偷偷重新分类。

- `apps/api/src/routes/chatbot-v2-context.ts`
  - 为 preTurn envelope 增加 `includeProgressionFollowUp`
  - 让 classifier -> orchestrator 产出的 follow-up 信号能往下传。

- `apps/api/src/__tests__/patient-public.routes.test.ts`
  - 调整 patient public 路由测试，让 starter / onboarding 场景能适配 classifier-aware 的新路径。

---

## `b7001c4` `Integrate chatbot v2 classifier turn context`

对应 chunk：

- Chunk 6

改动文件与具体逻辑：

- `apps/api/src/routes/chatbot-v2-context.ts`
  - 新建 / 充实 `buildChatbotV2TurnContext(...)`
  - 从 policy context 里取：
    - `journeySnapshot`
    - `allowedResources`
    - `conversationSummary`
    - `recentMessages`
  - 在 route 层构造 classifier input
  - 调用 dedicated classifier
  - 再把 classifier 结果交给 orchestrator
  - 最终产出 `preTurn` 和 `foundation` 两部分上下文。

- `apps/api/src/__tests__/chatbot-v2-context.test.ts`
  - 新增 route-adjacent tests
  - 验证 later-stage process explanation 不会 rewind journey
  - 验证 recent_messages 缺失时，会 fallback 到 repo messages。

- `apps/api/src/routes/chatbot.routes.ts`
  - 在 public chat route 里正式接入 `buildChatbotV2TurnContext(...)`
  - 在 assistant metadata 里写入 `chatbotV2`
  - 让 Dify composer 真正收到 v2 preTurn context。

- `apps/api/src/__tests__/chatbot.routes.test.ts`
  - 补 public chat route 对 classifier-aware context 的断言。

- `packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts`
  - 去掉了这里内部直接调用 orchestrator 的逻辑
  - 不再在 policy context 阶段就提前算 `request_class / response_intent`
  - 现在只返回更纯粹的 foundation state：
    - 原始 `journey_snapshot`
    - 原始 `allowed_resources`
  - 这样 classifier/orchestrator 的职责就回到 route 层，避免“上游先推断一遍、下游再推断一遍”。

- `packages/application/src/use-cases/ai-policy/__tests__/get-ai-policy-context.use-case.test.ts`
  - 测试改成断言：
    - `chatbot_v2` 不再包含 `request_class`
    - `chatbot_v2` 不再包含 `response_intent`
    - 只保留 foundation 资源和快照输出。

---

## `147865c` `Harden chatbot v2 classifier routing`

对应 chunk：

- Chunk 6

改动文件与具体逻辑：

- `apps/api/src/routes/chatbot-v2-context.ts`
  - `buildAllowedResourceHints(...)` 改成支持根据当前 journey stage 补充 supplemental hints
  - 在 `EXPLAIN_PROCESS` 阶段，即使当前 visible resources 里还没有：
    - `MEDICAL_DOC_UPLOAD`
    - `QUESTIONNAIRE`
    - `HOSPITAL_RECOMMENDATION`
    - `PACKAGE_RECOMMENDATION`
  - classifier hints 里也会补进去
  - 这样用户在 explain 阶段直接说“我要填问卷 / 看推荐”时，classifier 仍能正确识别成 explicit resource request。

- `apps/api/src/routes/chatbot.routes.ts`
  - 把 `normalizedUserMessage` 抽出来统一处理
  - assistant draft 在调用 classifier 之前先创建
  - classifier/provider 失败时，assistant draft 会被标记成 `provider_error`
  - metadata 里新增 `classifierResult`

- `apps/api/src/routes/patient-widget-starter.ts`
  - starter message 走 classifier override 路径
  - 强制 starter turn 视为 `process_explanation + PROCESS_GUIDE`
  - 并把 `classifierResult` 一起存入 metadata。

- `apps/api/src/__tests__/chatbot-v2-context.test.ts`
  - 增加对 supplemental resource hints 的测试。

- `apps/api/src/__tests__/chatbot.routes.test.ts`
  - 增加 route failure path tests
  - 验证 classifier 失败、invalid payload、later-stage suggestion 等情况。

- `apps/api/src/__tests__/patient-public.routes.test.ts`
  - 跟进 starter path 的新 metadata / route 行为测试。

---

## `d6da7c4` `Remove local chatbot classifier fallback`

对应 chunk：

- Chunk 6 的真正切换点

改动文件与具体逻辑：

- `packages/application/src/services/chatbot-v2/request-classifier.service.ts`
  - 直接删除旧的 rule-based classifier 文件。

- `packages/application/src/services/__tests__/chatbot-v2/request-classifier.service.test.ts`
  - 删除旧 classifier 的测试。

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - 删除内部 `RequestClassifierService` 依赖
  - `orchestrate()` 现在如果没有 `input.classification`，直接抛错：
    - `classifier output is required`
  - 至此 orchestrator 不再自己分类。

- `packages/application/src/services/chatbot-v2/types.ts`
  - `ConversationOrchestratorInput.classification` 从 optional 改为 required
  - 删除 `userMessage` / `resolvedIntent` 这些旧 fallback 时代的输入字段。

- `packages/application/src/index.ts`
  - 移除 `RequestClassifierService` export
  - 只保留 `LlmRequestClassifierService` 作为主路径导出。

- `apps/api/src/routes/chatbot-v2-context.ts`
  - foundation 里默认放入 `DEFAULT_BOOTSTRAP_CLASSIFICATION`
  - post-turn orchestration 不再传 `userMessage` 给 orchestrator
  - 彻底走“先分类，再编排”的新路径。

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 增加“没有 classification 就报错”的测试。

---

## `491028c` `test: cover chatbot classifier integration`

对应 chunk：

- Chunk 7

改动文件与具体逻辑：

- `apps/api/src/__tests__/chatbot.routes.test.ts`
  - 增加 route-level classifier integration coverage
  - 验证 public chat route 会先调 classifier，再调 composer
  - 验证 classifier input 里会带：
    - recentMessages
    - conversationSummary
    - journeySnapshot
    - allowedResourceHints

- `apps/api/src/__tests__/patient-public.routes.test.ts`
  - 验证 onboarding / starter 场景不会错误调用 classifier
  - 确保 starter 走的是 override / seed path，而不是用户 turn classifier path。

---

## `4cf0c8b` `Add chatbot v2 regression coverage`

对应 chunk：

- Chunk 7

改动文件与具体逻辑：

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 增加“explicit resource request 优先于 progression follow-up”的回归测试
  - 防止 classifier 同时给出 resource + follow-up 时，orchestrator 错把主意图当成 progression。

- `packages/application/src/services/__tests__/chatbot-v2/llm-request-classifier.service.test.ts`
  - 增加 multilingual FAQ regression
  - 增加 submitted resource status question regression
  - 增加“即使 hints 里没有 `HUMAN_HANDOFF`，human help request 也要保留”这个回归测试。

---

## `6c16641` `Add chatbot v2 FAQ grounding workflow`

对应 chunk：

- Chunk 8

改动文件与具体逻辑：

- `.env.example`
  - 新增 `DIFY_FAQ_GROUNDING_APP_API_KEY`
  - 给 dedicated FAQ grounding app 单独配置入口。

- `packages/application/src/services/chatbot-v2/types.ts`
  - `ConversationOrchestrationResult` 新增 `requiresFaqGrounding?: boolean`
  - 让 orchestrator 能把“这轮需不需要 grounding”明确传给 route 层。

- `packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts`
  - 新增 `requiresFaqGrounding(...)`
  - 当前规则是：
    - `faq`
    - `process_explanation`
  - 这两类请求都会被标记为需要 FAQ grounding。

- `packages/application/src/services/__tests__/chatbot-v2/conversation-orchestrator.service.test.ts`
  - 为 requiresFaqGrounding 行为补测试。

- `apps/api/src/routes/chatbot-v2-context.ts`
  - foundation 增加：
    - `requiresFaqGrounding`
    - `activeHospitalContext`
  - 这样 route 层后面调用 grounding 时，已经拿到：
    - 需不需要 grounding
    - 当前是否有 active hospital
    - active hospital id / name。

- `apps/api/src/routes/chatbot-v2-faq-grounding.ts`
  - 新建 dedicated FAQ grounding route helper
  - 只接受：
    - `hospitalType`
    - `query`
    - `activeHospitalId`
    - `activeHospitalName`
  - 调用 `difyFaqGroundingApi`
  - 把响应标准化成：
    - `faqScope`
    - `categories`
    - `groundedContext`

- `apps/api/src/__tests__/chatbot-v2-faq-grounding.test.ts`
  - 验证 FAQ grounding helper 的 runtime 行为
  - 验证有 dedicated client 时会调用它
  - 验证输出会被 normalize 成固定 shape。

- `dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml`
  - 新建 dedicated FAQ grounding workflow
  - 做 category resolution
  - 做 `GENERAL_ONLY` / `HOSPITAL_AWARE` scope 判定
  - 用 compact router 决定走 general 还是 hospital-aware retrieval path
  - 输出 grounded context，而不是 final user-facing copy。

- `apps/api/src/__tests__/dify-faq-grounding-v2.contract.test.ts`
  - 锁上面这套 DSL 的输入、节点结构、scope 语义和输出合同。

- `dify-config/medora-ai-chatbot-v2.dsl.yml`
  - composer workflow 增加 `faqGrounding` 输入
  - 让 composer 消费 grounded FAQ context，而不是自己重做 FAQ scope/category 推断。

- `apps/api/src/__tests__/dify-workflow-v2.contract.test.ts`
  - 增加 composer 对 `faqGrounding` 输入的 contract 断言。

- `apps/api/src/composition-root.ts`
  - 新增 `difyFaqGroundingApi?: DifyApiClientService`
  - 只在 `DIFY_FAQ_GROUNDING_APP_API_KEY` 存在时才创建 dedicated grounding client。

- `apps/api/src/__tests__/composition-root.test.ts`
  - 验证没有 dedicated FAQ grounding key 时，不会错误复用 main Dify key 构造 grounding client。

- `apps/api/src/routes/chatbot.routes.ts`
  - public chat route 里接入 `resolveChatbotV2FaqGrounding(...)`
  - 只有 `chatbotV2Turn.foundation.requiresFaqGrounding` 为真时才调用
  - grounding 成功后，把 `faqGrounding` 传给 composer。

- `apps/api/src/routes/patient-widget-starter.ts`
  - starter path 同样接入 FAQ grounding
  - 确保第一条 assistant starter message 也能走 grounded process explanation 路径。

- `apps/api/src/__tests__/chatbot.routes.test.ts`
  - 增加 public chat route 对 FAQ grounding 的断言。

- `apps/api/src/__tests__/patient-public.routes.test.ts`
  - 增加 onboarding / starter path 对 FAQ grounding 的断言。

- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`
  - 把 Chunk 8 正式写进 plan
  - 从“只有 classifier/composer”扩展到“classifier -> FAQ grounding -> composer”
  - 也把定义完成条件扩展到 FAQ grounding 语义。

- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`
  - 同步加入 FAQ grounding 设计
  - 明确 preserved v1 FAQ semantics：
    - `GENERAL_ONLY`
    - `HOSPITAL_AWARE`
    - 不是 general miss 后再 fallback 到 hospital-aware。

---

## `45f6e07` `Enforce dedicated chatbot classifier config`

对应作用：

- 修复上一轮 review 抓到的核心问题

改动文件与具体逻辑：

- `apps/api/src/composition-root.ts`
  - classifier client 的创建逻辑改成和 FAQ grounding 一样
  - 现在先读：
    - `DIFY_CLASSIFIER_APP_API_KEY`
  - 只有这个值非空时，才创建 `difyClassifierApiClient`
  - 不再 fallback 到：
    - `DIFY_APP_API_KEY`
    - `DIFY_API_KEY`

- `apps/api/src/routes/chatbot-v2-context.ts`
  - `classifyTurn(...)` 开头增加硬检查
  - 如果没有 `input.services.difyClassifierApi`，直接抛错：
    - `DIFY_CLASSIFIER_APP_API_KEY is required for chatbot-v2 classification`
  - 同时删除了旧逻辑里的：
    - `input.services.difyClassifierApi ?? input.services.difyApi`
  - 也就是不再允许 classifier 请求悄悄落到 composer app。

- `apps/api/src/__tests__/composition-root.test.ts`
  - 新增测试：
    - 如果没有 `DIFY_CLASSIFIER_APP_API_KEY`
    - `services.difyClassifierApi` 必须是 `undefined`

- `apps/api/src/__tests__/chatbot-v2-context.test.ts`
  - 原来的测试是：
    - “没有 dedicated classifier client 时 fallback 到 difyApi”
  - 现在改成：
    - “没有 dedicated classifier client 时必须显式失败”
  - 并且断言 `difyApi.createChatMessage` 不会被调用。

这一个 commit 的意义非常明确：

- 它把 classifier 真正变成了 dedicated app
- 也把上一轮 review 的实质性风险关掉了

---

## 文档 / Spec / Plan 类 Commits

## `72d0d2e` `Add chat journey resource architecture spec`

改动文件：

- `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`

具体逻辑：

- 新增整份 architecture spec
- 确立 v2 总体架构：
  - CRM 是唯一 orchestration authority
  - Dify 只是 language layer
  - Journey 和 Resource 分层
  - FAQ 是 cross-cutting capability
  - status question 是 resource read，不是特殊分支
- 定义五个主 stage：
  - `EXPLAIN_PROCESS`
  - `COLLECT_MEDICAL_INPUTS`
  - `RECOMMENDATION`
  - `ONLINE_CONSULT`
  - `HUMAN_HANDOFF`

---

## `abb2e99` `Refine chat journey architecture spec`

改动文件：

- `docs/superpowers/specs/2026-04-10-chat-journey-resource-architecture-design.md`

具体逻辑：

- 补充 package-driven flow 不需要 online consult 时的终态说明
- 补充 CRM session resume 的优先级规则
- 补充 stale widget / stale resource 的处理原则
- 补充 resource update 的 idempotency、duplicate submit、stale detection 原则
- 等于是在 architecture 层把“恢复态、重试、重复提交”这些工程细节补全。

---

## `4b15182` `Add chat journey architecture implementation plan`

改动文件：

- `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`

具体逻辑：

- 新增 journey/resource architecture 的 implementation plan
- 把 architecture spec 拆成可执行 chunk 和文件计划。

---

## `2740cae` `Refine chat journey implementation plan`

改动文件：

- `docs/superpowers/plans/2026-04-10-chat-journey-resource-architecture-implementation.md`

具体逻辑：

- 微调 implementation plan 的步骤和边界
- 让 plan 更适合按 chunk 执行，而不是一次性大改。

---

## `c1c5ada` `Add chatbot v2 LLM classifier spec`

改动文件：

- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`

具体逻辑：

- 新增 classifier 设计 spec
- 定义 classifier 的输入合同：
  - `recentMessages`
  - `conversationSummary`
  - `journeySnapshot`
  - `allowedResourceHints`
- 定义 classifier 的输出合同：
  - `requestClass`
  - `targetResourceTypes`
  - `includeProgressionFollowUp`
- 明确“classifier understands, CRM decides, composer speaks”。

---

## `b995f1c` `Refine chatbot v2 LLM classifier spec`

改动文件：

- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`

具体逻辑：

- 收紧 classifier spec 的字段语义
- 细化 request classes 和 progression follow-up 的边界。

---

## `8727794` `Clarify chatbot v2 classifier spec semantics`

改动文件：

- `docs/superpowers/specs/2026-04-11-chatbot-v2-llm-classifier-design.md`

具体逻辑：

- 进一步澄清 classifier 的语义边界
- 避免实现者把它理解成“本地关键词路由升级版”
- 更强调它是 structured classification contract。

---

## `ebefd68` `Add chatbot v2 LLM classifier implementation plan`

改动文件：

- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`

具体逻辑：

- 新增 classifier implementation plan
- 首次把 Chunk 1-7 按文件和执行步骤完整拆开。

---

## `1525ab6` `Refine chatbot v2 LLM classifier plan`

改动文件：

- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`

具体逻辑：

- 把 plan 从“概念上的 classifier 改造”收紧为“必须删除旧 request-classifier fallback”
- 把 `composition-root.ts`
- `dify-api-client.service.ts`
- `.env.example`
- `packages/application/src/index.ts`
- `dify-workflow-v2.contract.test.ts`
  这些 supporting files 正式纳入 file plan
- 让 Chunk 3 不再只是“加个 service”，而是把 transport / env / exports / infra tests 一起纳入。

---

## `a0d4ee2` `Refine chatbot v2 LLM classifier plan`

改动文件：

- `docs/superpowers/plans/2026-04-11-chatbot-v2-llm-classifier-implementation.md`

具体逻辑：

- 在 Chunk 5 里补充一点很关键的约束：
  - composer workflow 只能消费 `includeProgressionFollowUp`
  - 不能在 composer 内部再次推导 follow-up
- 等于是在文档层把“不要让 composer 偷偷重新分类/重新推导 progression”再强调了一遍。

---

## 最后总结

如果你是从“代码改动逻辑”这个角度看，这一轮可以压缩成 5 条主线：

1. 先把 classifier 输入输出合同做成共享 schema 和 types
2. 再把本地 rule-based classifier 换成 dedicated LLM classifier adapter
3. 再把 route 层改成 classifier -> orchestrator -> composer
4. 再把 v1 的 FAQ scope / grounding 语义迁进 dedicated FAQ grounding workflow
5. 最后用 `45f6e07` 把 dedicated classifier config 强制化，关掉错误 fallback

其中真正决定“这轮是否可以收口”的，是最后这两件事：

- `6c16641`
- `45f6e07`

因为它们把：

- v1 FAQ 语义迁移
- classifier dedicated app 边界

这两个最容易出真实事故的地方，真正补齐了。
