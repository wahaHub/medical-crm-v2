# Chatbot V2 核心文件逻辑全分析

## 文档范围

这篇文档只分析当前 `chatbot v2` 主链路里真正起作用的逻辑，不展开只属于 `v1` 的旧实现细节。

本文重点覆盖这几个文件：

- [chat-journey.schema.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts)
- [conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts)
- [llm-request-classifier.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts)
- [composition-root.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts)
- [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts)
- [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts)
- [get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts)
- [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts)

额外会回答一个关键问题：

- `request-classifier.service.ts` 还有没有必要存在

---

## 先说结论

当前 `chatbot v2` 主链路已经基本稳定成下面这个模型：

1. `CRM` 先从 session / status snapshot / recent messages / active hospital context 里构造一个 `foundation context`
2. `LLM classifier` 只负责把“这轮用户请求是什么”分类成一个结构化结果
3. `ConversationOrchestratorService` 只负责把 classifier 结果映射成：
   - 当前轮允许暴露哪些 resource
   - 是否需要预推进 journey
   - 是否要做 FAQ grounding
4. `Dify composer` 再根据这个结构化上下文生成最终回复
5. 回复完成后，系统会再根据刷新后的 `status snapshot` 重算一次 `postTurn chatbotV2 envelope`

也就是说，当前 v2 的职责分层已经比较清晰：

- `schema` 定义 contract
- `policy context` 提供基础事实
- `classifier` 理解用户意图
- `orchestrator` 做业务编排
- `routes` 做运行时接线
- `composer` 负责最终生成文本

### 对 `request-classifier.service.ts` 的最终判断

当前 v2 下，这个文件已经没有保留必要。

原因不是“理论上可以删”，而是“现在 runtime 主链已经不依赖它，而且代码里实际上也已经删掉了”：

- 当前 `packages/application/src/services/chatbot-v2/` 目录下只剩：
  - `conversation-orchestrator.service.ts`
  - `journey-engine.service.ts`
  - `journey-truth.service.ts`
  - `llm-request-classifier.service.ts`
  - `resource-registry.service.ts`
  - `types.ts`
- `chatbot-v2-context.ts` 现在只实例化 `LlmRequestClassifierService`
- `ConversationOrchestratorService` 也已经强制要求外部传入 `classification`
- 当前仓库里和 `RequestClassifierService` 相关的命中，主要已经只剩旧 spec / old plan / analysis 文档引用

所以从当前真实实现看：

- `request-classifier.service.ts` 不应该再作为 v2 保留层存在
- 它已经不是“兼容层”，而是“已经被移除的历史方案”
- 如果你们还要继续整理文档，反而应该把旧文档里仍把它写成存量文件的地方修掉

---

## V2 总体调用链

### 1. 入口有两条

当前 v2 主要有两条实际运行链路：

- 普通聊天请求从 [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts) 的 `POST /api/v2/chatbot/chat` 进入
- 首条 starter 消息从 [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts) 的 `seedWidgetStarterMessage(...)` 进入

这两条链路都会调用：

- `buildChatbotV2TurnContext(...)`
- 必要时 `resolveChatbotV2FaqGrounding(...)`
- Dify composer
- `buildChatbotV2PostTurnContext(...)`

### 2. foundation context 先由 CRM 构造

[get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts) 现在不再替 v2 做决策，它只负责把 CRM 当前知道的事实打包出来，例如：

- `chatbot_v2.scope_id`
- `chatbot_v2.journey_snapshot`
- `chatbot_v2.allowed_resources`
- `status_snapshot`
- `conversation_summary`
- `active_hospital_context`
- `recent_messages`

这一步的本质是：

- 先把“事实真相”准备好
- 但不在这里决定“这一轮该怎么回复”

### 3. classifier 再解释这一轮用户请求

[chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts) 会：

- 从 foundation context 里读出 `journeySnapshot`、`resources`、`conversationSummary`
- 组装 classifier 输入
- 调用 `LlmRequestClassifierService`

classifier 输出的核心只有 3 个字段：

- `requestClass`
- `targetResourceTypes`
- `includeProgressionFollowUp`

### 4. orchestrator 把 classifier 结果变成“可执行业务上下文”

[conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts) 会根据：

- 当前 `journeySnapshot`
- 当前 `truth`
- classifier 输出

推导出：

- 这一轮允许展示的 resources
- 是否要先把 `journey` 从 `EXPLAIN_PROCESS` 预推进到 `COLLECT_MEDICAL_INPUTS.pre`
- 是否要切到 `HUMAN_HANDOFF.pre`
- 是否要做 FAQ grounding

### 5. composer 只消费结构化上下文，不自己决定业务流程

在 [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts) 和 [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts) 中，Dify composer 收到的关键输入是：

- `chatbotV2: preTurn`
- 可选的 `faqGrounding`
- session / hospital / pageContext / attachments 等上下文

这意味着当前 v2 的原则是：

- composer 负责“怎么说”
- CRM 负责“能说什么、能展示什么、要不要推进流程”

### 6. 回复结束后重新计算 post-turn context

assistant 回复写回后，系统会用刷新后的 `statusSnapshot` 再跑一次 `buildChatbotV2PostTurnContext(...)`。

这一步的价值是：

- 让最终存入消息 metadata 的 `chatbotV2` 更接近最新 truth
- 避免 pre-turn 的预测状态和写回后的真实状态长期漂移

---

## 1. `chat-journey.schema.ts`

文件： [chat-journey.schema.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts)

### 这个文件在 v2 里的角色

它是整个 `chatbot v2` 的共享 contract 层。

它不是“辅助工具文件”，而是 v2 运行边界的正式定义。只要某个对象要在 v2 里流转，它大概率都要符合这个文件里的 schema。

### 它定义了什么

#### 1. journey 的状态空间

它把 journey stage 固定成 5 个：

- `EXPLAIN_PROCESS`
- `COLLECT_MEDICAL_INPUTS`
- `RECOMMENDATION`
- `ONLINE_CONSULT`
- `HUMAN_HANDOFF`

同时把 phase 固定成：

- `pre`
- `active`
- `post`

这里的含义很重要：

- `stage` 表示“用户走到哪一个大阶段”
- `phase` 表示“这个阶段现在是准备进入、正在进行、还是已经完成”

这让 v2 可以表达“马上进入资料采集阶段但还没真正提交”的状态，也就是 `COLLECT_MEDICAL_INPUTS.pre`。

#### 2. resource 的统一类型系统

它把 chat resource 固定成 8 类：

- `PROCESS_GUIDE`
- `MEDICAL_DOC_UPLOAD`
- `QUESTIONNAIRE`
- `HOSPITAL_RECOMMENDATION`
- `PACKAGE_RECOMMENDATION`
- `ONLINE_CONSULT_BOOKING`
- `HUMAN_HANDOFF`
- `MEDICAL_INVITATION_STATUS`

这意味着在 v2 里，前台 chat 能展示的结构化能力不是任意自由文本，而是被约束在这组受控资源里。

#### 3. classifier 的输入 contract

`ChatbotV2ClassifierInputSchema` 要求 classifier 看到的是：

- 最近 1 到 6 条消息
- `conversationSummary`
- `journeySnapshot`
- `allowedResourceHints`

这个约束体现了一个关键设计：

- classifier 不直接读整个系统对象
- classifier 只读一个被裁剪过的、可控的输入窗口

#### 4. classifier 的输出 contract

`ChatbotV2ClassifierResultSchema` 要求 classifier 输出：

- `requestClass`
- `targetResourceTypes`
- `includeProgressionFollowUp`

并且用 `superRefine` 做了很多硬约束：

- `faq` 不能指向具体 resources
- `process_explanation` 只能指向 `PROCESS_GUIDE`
- `progression_request` 不能指向具体 resources
- `resource_request` 和 `resource_status_question` 必须至少指向一个 resource
- `human_help_request` 如果带 target，只能是 `HUMAN_HANDOFF`
- `includeProgressionFollowUp` 只能出现在 `faq` 或 `process_explanation`
- `targetResourceTypes` 不能重复

这些约束的实际价值非常大：

- 防止 classifier 随意输出奇怪组合
- 把 LLM 的自由度压进一个有限安全空间
- 让 orchestrator 可以放心把 classifier 结果当成结构化输入继续处理

### 它怎么被当前 v2 使用

主要被以下位置直接使用：

- [llm-request-classifier.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts)
  - 对 classifier 输入输出做 parse / validate
- [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts)
  - 对 foundation 读出来的 `journeySnapshot` 和 `resources` 做 parse
- 其他 route / service
  - 依赖这些类型作为共享运行契约

### 这个文件在 v2 的真实意义

它是 v2 的“边界守门员”。

没有它，v2 很容易重新退化成：

- route 自己拼对象
- Dify 返回什么就信什么
- orchestrator 和前台各自理解一套字段

有了它之后，至少这几个关键对象在所有层之间是统一的：

- journey snapshot
- resource descriptor
- classifier input
- classifier result

---

## 2. `conversation-orchestrator.service.ts`

文件： [conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts)

### 这个文件在 v2 里的角色

它是 v2 的业务编排核心。

它不负责理解自然语言，也不负责生成答案；它只负责把“当前事实 + classifier 结果”转成“这一轮业务上允许发生什么”。

### 核心输入

它要求调用方传入：

- `scopeId`
- `journeySnapshot`
- `truth`
- `classification`

而且现在有一个很重要的硬约束：

- 如果没有 `classification`，直接抛错 `classifier output is required`

这说明当前 v2 已经彻底放弃了 route 内部 fallback classifier 的旧模式。

### 它内部的决策步骤

#### 1. 先计算当前时刻可见 resources

它把当前 snapshot 转成 `ResourceRegistryInput`，再调用 `ResourceRegistryService.listResources(...)` 算出当前允许暴露的 resources。

这里会调用 `normalizeSnapshotForResources(...)`：

- 如果 snapshot 处于 `pre` phase
- 它会把 phase 临时归一化成 `active`

原因是：

- `pre` 表示业务上准备进入下一阶段
- 但前台需要的其实已经是“下一阶段应该展示哪些资源”
- 所以资源编排要提前看到 next-stage resources

这一步是 v2 很关键的设计点：

- `journey state` 和 `resource exposure` 不是简单一比一
- `pre` 阶段本质上就是“流程先推进，资源先准备”

#### 2. 决定是否接受 `includeProgressionFollowUp`

`shouldAcceptProgressionFollowUp(...)` 的规则很明确：

- classifier 没带这个标记，不接受
- 只有 `faq` 和 `process_explanation` 才允许带这个标记
- 当前如果已经在 `HUMAN_HANDOFF`，就不再接受这个推进建议

这个逻辑的含义是：

- FAQ / 流程解释类回答，允许顺手带一个“下一步你可以去做 xxx”
- 但真正的业务推进权仍在 CRM，不在 LLM

#### 3. 决定是否更新 journey

`computeJourneyUpdate(...)` 只做两类预推进：

第一类，从 `EXPLAIN_PROCESS` 推到 `COLLECT_MEDICAL_INPUTS.pre`

触发条件有 3 组：

- `requestClass === progression_request`
- 或 `includeProgressionFollowUpAccepted === true`
- 或 `requestClass === resource_request`，且 target 里命中：
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`

这里体现的意思是：

- 即使用户不是明确说“我准备下一步了”
- 只要他已经明确在要资料上传、问卷、推荐等核心流程资源
- 系统也可以把对话上下文推进到下一阶段

第二类，切到 `HUMAN_HANDOFF.pre`

触发条件：

- `requestClass === human_help_request`
- 且当前 stage 还不是 `HUMAN_HANDOFF`

#### 4. 基于 projected snapshot 重新算资源

如果上一步产生了 `journeyUpdate`，orchestrator 不会只看旧 snapshot，而是会基于 projected snapshot 再算一次 allowed resources。

这非常关键，因为：

- 如果当前是 `EXPLAIN_PROCESS.active`
- 用户这轮明确要上传资料
- 那么最终交给 composer 的不应该还是 process-only resources
- 而应该已经是 `COLLECT_MEDICAL_INPUTS` 对应的 resources

#### 5. 如果 classifier 指定 target resources，则尽量收窄资源范围

它会在 projected resources 里筛选 `classification.targetResourceTypes` 命中的资源。

如果筛出来有结果：

- 当前轮的 `allowedResources` 就只保留这批 targeted resources

如果筛不出来：

- 再走隐式解析

隐式解析当前只有一种：

- `human_help_request` 自动解析成 `HUMAN_HANDOFF`

这意味着：

- 用户说“我想找真人”时，不要求 classifier 一定显式写出 `HUMAN_HANDOFF`
- 编排层会补全这个资源目标

#### 6. 计算 `resourceUpdates`

`computeResourceUpdates(...)` 只在 journeyUpdate 存在时工作。

规则是：

- 如果已经有 targeted resources，就把 targeted resources 当成 updates
- 否则把 projected resources 和 current resources 做 diff
- 找出那些“因为阶段推进而新出现的资源”

这是为了支持：

- 当前轮只把新增/变更的 resource 作为重点暴露

#### 7. 标记是否需要 FAQ grounding

规则非常简单：

- `faq`
- `process_explanation`

这两类请求返回 `requiresFaqGrounding = true`

也就是说，当前 v2 的 grounding 不是所有请求都跑，而是只对更依赖知识解释的请求跑。

### 它输出什么

它输出：

- `requestClass`
- `responseIntent`
- `allowedResources`
- `includeProgressionFollowUpAccepted`
- `requiresFaqGrounding`
- `journeyUpdate`
- `resourceUpdates`

其中 `responseIntent` 当前直接等于 `requestClass`，说明现在 v2 还没有单独引入“request class”和“response intent”的更复杂映射层。

### 它怎么被当前 v2 使用

主要由 [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts) 调用两次：

- pre-turn：根据 classifier 结果决定 composer 前该暴露什么
- post-turn：根据刷新后的 truth 再算一遍最终 envelope

### 这个文件在 v2 的真实意义

它是把“LLM 理解”转成“CRM 业务动作”的那层翻译器。

如果没有它，v2 会退化成：

- classifier 直接控制流程
- composer 直接猜该暴露什么资源

而有了它之后，v2 的控制面仍然留在 CRM。

---

## 3. `llm-request-classifier.service.ts`

文件： [llm-request-classifier.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts)

### 这个文件在 v2 里的角色

它是 LLM classifier 的薄适配层。

它的作用不是做规则分类，而是：

- 验证输入结构
- 调用外部 classifier gateway
- 解析并验证返回结构

### 它的内部逻辑非常克制

#### 1. 输入先过 schema

`classify(input)` 先执行：

- `ChatbotV2ClassifierInputSchema.parse(input)`

这一步保证 route 不会把脏对象直接打给 classifier workflow。

#### 2. 通过 gateway 调外部 classifier

真正的远程调用不写死在 service 里，而是通过 `LlmRequestClassifierGateway` 接口注入：

- `classify(input: ChatbotV2ClassifierInput): Promise<unknown>`

这意味着 service 本身和 Dify SDK / HTTP client 解耦。

#### 3. 统一解析返回

`parseClassifierResult(rawResult)` 支持 3 种结构：

第一种，直接就是结构化对象

- 直接拿 `rawResult` 去做 `ChatbotV2ClassifierResultSchema.safeParse`

第二种，结构化 JSON 被塞进 `answer`

- 如果 `answer` 是字符串
- 且可以 `JSON.parse`
- 再把 parse 后结果做 schema 校验

第三种，结构化结果被塞进 `metadata.classifierResult` 或 `metadata.classifier_result`

- 从 `metadata` 里读出来再校验

如果以上都不满足：

- 抛错 `Invalid classifier result payload`

### 这个解析策略的意义

它不是多余宽松，而是在适配 Dify workflow 常见返回形态：

- 有的 workflow 直接产 JSON object
- 有的 workflow 习惯把 JSON 作为文本塞在 `answer`
- 有的 workflow 把结构化结果挂到 `metadata`

这个 service 把这些不一致性都收敛到了一个地方。

### 它怎么被当前 v2 使用

目前由 [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts) 在 `classifyTurn(...)` 中实例化和调用。

它自己不关心 Dify key、sessionId、conversationId，只关心：

- 输入是不是合法 classifier input
- 输出能不能被还原成合法 classifier result

### 这个文件在 v2 的真实意义

它是 v2 classifier 的信任边界。

它不让 route 直接相信 Dify 返回值，而是强制把返回值重新塞回 shared schema。

---

## 4. `composition-root.ts`

文件： [composition-root.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts)

### 这个文件在 v2 里的角色

它是整个 API runtime 的装配根。

对于 chatbot v2 来说，它的关键意义不是“普通依赖注入”，而是决定：

- 哪些 Dify client 会被创建
- 哪些 use case / repo 会被 route 拿到
- classifier 和 grounding 是不是独立配置

### 当前 v2 相关的关键装配逻辑

#### 1. 主 composer client

它总是创建：

- `difyApi`

使用的 key 是：

- `DIFY_APP_API_KEY`
- 或回退 `DIFY_API_KEY`

这个 client 是当前聊天主 composer 的调用入口。

#### 2. classifier client

它现在只会在配置了下面这个 env 时创建：

- `DIFY_CLASSIFIER_APP_API_KEY`

如果这个值为空：

- `difyClassifierApi` 就是 `undefined`

这点非常重要，因为这代表当前系统已经明确区分：

- 主聊天 composer app
- classifier app

它不再允许 classifier 悄悄回退到 composer app。

#### 3. FAQ grounding client

同样地，它只会在配置了下面这个 env 时创建：

- `DIFY_FAQ_GROUNDING_APP_API_KEY`

如果没配：

- `difyFaqGroundingApi` 为 `undefined`

#### 4. `getAiPolicyContext` 的装配

它创建了：

- `ContextBuilderService`
- `GetAiPolicyContextUseCase`

并把它们挂到 `services.getAiPolicyContext`

这就使 route 可以在运行时随时拿到当前 session 的 foundation context。

### 它怎么被当前 v2 使用

几个关键 route 都是通过 `getServices()` 直接取：

- `chatbot.routes.ts`
- `chatbot-v2-context.ts`
- `patient-widget-starter.ts`

当前 v2 真正依赖它提供的东西主要有：

- `aiChatSessionRepo`
- `aiChatMessageRepo`
- `getAiPolicyContext`
- `difyApi`
- `difyClassifierApi`
- `difyFaqGroundingApi`
- `getTemplateByDisease`

### 这个文件在 v2 的真实意义

它决定了 v2 是否真的拥有“分离的工作流边界”。

尤其是 `45f6e07 Enforce dedicated chatbot classifier config` 之后，这个文件的配置策略已经明确表达了：

- classifier 必须是 dedicated app
- composer 继续是 dedicated main app
- grounding 也是可独立开关的 dedicated app

这其实就是 v2 运行时架构的落地点。

---

## 5. `chatbot-v2-context.ts`

文件： [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts)

### 这个文件在 v2 里的角色

它是 v2 的 turn-context builder。

如果说：

- `getAiPolicyContext` 负责拿基础事实
- `classifier` 负责理解请求
- `orchestrator` 负责做业务编排

那么这个文件就是把这三件事真正串起来的运行时入口。

### 它主要暴露两个函数

- `buildChatbotV2TurnContext(...)`
- `buildChatbotV2PostTurnContext(...)`

这两个函数分别对应：

- 发给 composer 之前的 `preTurn context`
- assistant 回复完成之后的 `postTurn context`

### `buildChatbotV2TurnContext(...)` 的完整逻辑

#### 1. 先拿 foundation context

它先调用：

- `services.getAiPolicyContext.execute(...)`

得到 policy context 后，再通过 `readFoundationContext(...)` 读出：

- `scopeId`
- `journeySnapshot`
- `truth`
- `resources`
- `activeHospitalContext`
- 可选的旧 `requestClass` / `responseIntent`

这里最重要的是：

- 它不是信任整个 policy context 原样透传
- 而是自己重新 parse 一遍 `journeySnapshot` 和 `resources`

#### 2. 空消息特殊处理

如果 `userMessage.trim().length === 0`：

- 直接返回一个 bootstrap 结果
- `requestClass = process_explanation`
- `responseIntent = process_explanation`
- `classification = DEFAULT_BOOTSTRAP_CLASSIFICATION`
- `requiresFaqGrounding = true`

这个逻辑主要服务于 widget starter / 空首轮引导场景。

#### 3. 正常消息先分类

如果不是空消息：

- 有 `classifierOverride` 就直接用 override
- 否则调用 `classifyTurn(...)`

`classifyTurn(...)` 内部做几件事：

- 检查 `services.difyClassifierApi` 是否存在
- 不存在就抛错 `DIFY_CLASSIFIER_APP_API_KEY is required for chatbot-v2 classification`
- 组装 `LlmRequestClassifierService`
- 把最近消息、summary、journey snapshot、resource hints 送给 classifier

这说明当前 v2 是强制 dedicated classifier config 的。

#### 4. 如何组装 classifier 输入

`buildRecentMessages(...)` 的优先级是：

第一优先：

- 从 policy context 的 `recent_messages` 读取

如果 policy context 没给：

- 回退到 repo 查 session 最近消息

最后：

- 再把当前轮 user message append 进去
- 最多保留 6 条

`buildAllowedResourceHints(...)` 的逻辑是：

- 先把当前 resources 的 `resourceType` 放进去
- 如果当前 stage 是 `EXPLAIN_PROCESS`
- 额外补充：
  - `MEDICAL_DOC_UPLOAD`
  - `QUESTIONNAIRE`
  - `HOSPITAL_RECOMMENDATION`
  - `PACKAGE_RECOMMENDATION`

这个补充 hint 很重要。

它的含义是：

- 即便当前 visible resources 还只有 process guide
- classifier 也要知道用户可能在问“上传资料”“问卷”“推荐医院”这些即将发生的流程资源
- 否则 classifier 很容易把这类请求误打成纯 FAQ

#### 5. 分类完之后立刻编排

拿到 classification 后，它立即调用：

- `orchestrator.orchestrate(...)`

然后生成 `preTurn`：

- `journeySnapshot` 用 `journeyUpdate ?? foundation.journeySnapshot`
- `resources` 用 orchestrated `allowedResources`
- `requestClass`
- `responseIntent`
- `includeProgressionFollowUp`

同时把 foundation 也保留：

- 原始 truth
- classification
- `requiresFaqGrounding`
- active hospital context

### `buildChatbotV2PostTurnContext(...)` 的完整逻辑

这个函数的目标不是重新分类，而是：

- 用最新 truth 修正 pre-turn 上下文

它的步骤是：

#### 1. 从刷新后的 status snapshot 重新推导 truth

如果有 `refreshedStatusSnapshot`：

- 调 `deriveJourneyTruthFromStatusSnapshot(...)`

否则：

- 继续用 foundation.truth

#### 2. 再从 truth 推导最新 journey snapshot

调用：

- `journeyEngine.deriveSnapshot(refreshedTruth)`

#### 3. 如果刷新后的 snapshot 比 preTurn 更“倒退”，就保留 preTurn

它会用 `compareJourneySnapshots(...)` 比较 preTurn 和 refreshed snapshot。

如果 refreshed 反而更早：

- 直接保留 preTurn

这个保护很关键，因为写回是异步的，系统不希望刚刚预推进到下一阶段，又因为 snapshot 落后把 UI 拉回去。

#### 4. 空 userMessage 不重新编排

如果本轮 userMessage 为空：

- 直接返回 `refreshedJourneySnapshot + preTurn.resources`

#### 5. 非空 userMessage 则基于 preserved classification 再编排一次

它再次调用：

- `orchestrator.orchestrate(...)`

但这里不再重新做 classifier，而是继续使用：

- `input.foundation.classification`

所以 post-turn 的作用是：

- 重新贴合最新 truth
- 但不改变这一轮对用户请求的语义判断

### 它怎么被当前 v2 使用

直接被两条链路调用：

- [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts)
- [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts)

### 这个文件在 v2 的真实意义

它是 v2 的“单轮上下文控制塔”。

一轮消息里：

- 什么 facts 被带入
- classifier 看什么
- journey 怎么预推进
- FAQ grounding 要不要开
- 回复后最终落什么 envelope

基本都由它统一控制。

---

## 6. `chatbot.routes.ts`

文件： [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts)

### 这个文件在 v2 里的角色

它仍然是生产聊天入口。

虽然这个文件还背着一些 legacy 输出兼容逻辑，但从 v2 主链路看，它现在的核心职责已经很明确：

- 接收聊天请求
- 持久化 user / assistant draft message
- 调用 v2 turn context builder
- 调用 FAQ grounding
- 调用 Dify composer
- 生成并持久化 post-turn chatbotV2 envelope

### `POST /api/v2/chatbot/chat` 的 v2 逻辑

#### 1. 先确保 session 可用

它会：

- 查 `sessionId`
- 不存在就创建 chatbot session
- 校验 hospital type
- 处理 session secret
- 如果病人已登录，尝试把 patient 绑定到 session

这些是聊天入口的会话层逻辑，不是 v2 独有，但后续 v2 依赖它提供：

- `session`
- `statusSnapshot`
- `difyConversationId`

#### 2. 先落 user message 和 assistant draft

在真正请求 Dify 之前，它先：

- 创建一条 `USER` message
- 再创建一条空内容的 `ASSISTANT` draft message

assistant draft 先落库的价值是：

- 即使后续 provider 失败，也有一个 draft message 可以标记失败状态
- 后续 composer 也能拿到 `assistantMessageId`

#### 3. 构建 v2 pre-turn context

它调用：

- `buildChatbotV2TurnContext(...)`

输入包括：

- `services`
- `sessionId`
- `normalizedUserMessage`
- `pageContext`

得到的结果包含：

- `preTurn`
- `foundation`

#### 4. 按需跑 FAQ grounding

如果：

- `chatbotV2Turn.foundation.requiresFaqGrounding === true`

则调用：

- `resolveChatbotV2FaqGrounding(...)`

并把下面这些东西送进去：

- `scopeId`
- `hospitalType`
- `query`
- `activeHospitalContext`

#### 5. 调用 Dify composer

它给主聊天 app 发送：

- `hospitalType`
- `sessionId`
- `assistantMessageId`
- `attachments`
- `pageContext`
- `currentStatus`
- `conversationSummary`
- 可选 `faqGrounding`
- `chatbotV2: chatbotV2Turn.preTurn`

这里最重要的点是：

- composer 直接收到的是 CRM 编排后的 `preTurn`
- 不是自己再去决定这轮能展示什么

#### 6. 收到 composer 结果后做规范化

它调用：

- `normalizeDifyChatResponse(...)`

这个函数会把 Dify 返回的多种字段来源统一起来，抽出：

- `answer`
- `nextAction`
- `internalNextAction`
- `citations`
- `reasonCodes`
- `shortlist`
- 规范化 metadata

对 v2 来说，这一步的意义是：

- composer 输出形态可能不完全稳定
- route 需要先把响应标准化后再写库和回传前台

#### 7. 用刷新后的 snapshot 生成 post-turn context

它调用：

- `buildChatbotV2PostTurnContext(...)`

输入包括：

- `foundation`
- `preTurn`
- `userMessage`
- `session.statusSnapshot`

最后得到：

- `postTurnChatbotV2`

#### 8. 把 `chatbotV2` 和 classifier 结果落到 assistant metadata

更新 assistant message 时，它会把这些关键字段存进去：

- `chatbotV2: postTurnChatbotV2`
- `classifierResult: chatbotV2Turn.foundation.classification`

这意味着：

- 这轮 assistant message 自己就带着一份 v2 结构化上下文快照
- 后续 history / debug / analysis 可以直接从 message metadata 回看这轮编排结果

#### 9. 对外返回 v2 结构化结果

响应里直接带：

- `journeySnapshot`
- `resources`
- `metadata`

这就是当前 China 前台能消费 v2 结构化能力的基础。

### 需要特别注意的一点

这个 route 现在仍然会生成 `blocks`。

但从 v2 架构角度看，`blocks` 不是控制面真相，它只是当前前台 rollout 过程中的兼容输出层。这里不展开旧逻辑细节，只记住一点：

- v2 真正的结构化来源是 `postTurnChatbotV2`
- `blocks` 只是当前交付阶段还在保留的展示桥接产物

### 这个文件在 v2 的真实意义

它是 v2 在生产流量上的“执行容器”。

真正把 classifier、grounding、composer、post-turn reconciliation 串到一起的，是这个 route。

---

## 7. `get-ai-policy-context.use-case.ts`

文件： [get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts)

### 这个文件在 v2 里的角色

它现在是 foundation context export use case。

它不再承担 v2 决策，不再内部调用 orchestrator，也不直接输出“这轮应该怎么回复”。它只负责把 ContextBuilder 生成的 CRM 事实压成一个可消费对象。

### 它的内部逻辑

#### 1. 调 `ContextBuilderService.build(input)`

输入是：

- `sessionId`
- `userMessage`
- 可选 `pageContext`

#### 2. 把 contextBuilder 返回的 domain context 映射成公开结构

返回对象主要分成几块：

##### `chatbot_v2`

里面包含：

- `source`
- `scope_id`
- `journey_snapshot`
- `allowed_resources`

这部分就是 v2 foundation 的核心。

##### `status_snapshot`

包括：

- `condition_status`
- `form_status`
- `doc_upload_status`
- `recommendation_status`
- `consultation_status`
- `package_status`
- `handoff_status`
- `risk_level`
- `trust_or_objection`
- 各种最后时间戳

##### `conversation_summary`

这是 classifier 和 composer 都会用到的文本摘要来源之一。

##### `active_hospital_context`

给 grounding 和 hospital-detail 语境使用。

##### `recent_messages`

给 classifier 组 recent message window 时优先使用。

##### `active_followups` / `recent_timeline` / `recent_handoffs`

这些更多是上下文扩展信息，当前 v2 核心 turn builder 主要直接消费的是：

- `chatbot_v2`
- `status_snapshot`
- `conversation_summary`
- `active_hospital_context`
- `recent_messages`

### 它怎么被当前 v2 使用

由 [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts) 在每一轮开始时调用。

### 这个文件在 v2 的真实意义

它把“context truth construction”和“turn-time decision making”彻底拆开了。

这是 v2 很关键的改进，因为：

- foundation context 应该稳定、可复用
- classifier / orchestrator 只是这个基础上的决策层

---

## 8. `patient-widget-starter.ts`

文件： [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts)

### 这个文件在 v2 里的角色

它负责生成 widget 的第一条 assistant starter message。

在 v2 里，它不是简单写一段固定欢迎语，而是把 starter 也纳入：

- v2 turn context
- FAQ grounding
- composer
- post-turn reconciliation

所以 starter 现在本质上也是一个受 CRM 编排控制的 v2 turn。

### 它的完整逻辑

#### 1. 先判断是否需要 seed

它会检查：

- 有没有 `widgetSessionId`
- session 是否存在
- 当前 session 里是否已经有 non-starter messages
- 旧 starter 是否已经是当前版本

如果已经有正常对话或当前 starter 已经是最新版本：

- 直接不再重复 seed

#### 2. 若需要，则先创建一条 assistant draft

如果 starter message 还不存在：

- 先创建一条空 `ASSISTANT` message
- metadata 标记：
  - `widgetStarterSeed: true`
  - `widgetStarterVersion`
  - `draftState: pending`

#### 3. 强制用 process explanation 作为 starter 的 classification

它调用：

- `buildChatbotV2TurnContext(...)`

但传了 `classifierOverride`：

- `requestClass = process_explanation`
- `targetResourceTypes = ['PROCESS_GUIDE']`
- `includeProgressionFollowUp = false`

这说明 starter 不是让 classifier 自由判断，而是明确固定成：

- 用 process explanation 口径开场

#### 4. 按需 FAQ grounding

如果 foundation 标记需要 grounding：

- 调 `resolveChatbotV2FaqGrounding(...)`

query 固定是：

- `Explain the process`

#### 5. 调 composer 生成 starter

它调用主 Dify composer 时，关键输入包括：

- `bootstrapMode: 'WIDGET_STARTER'`
- `destination`
- `category`
- `procedureId`
- `chatbotV2: chatbotV2Turn.preTurn`
- 可选 `faqGrounding`

query 本身不是固定一句，而是 `buildWidgetStarterPrompt(...)` 动态拼出来的 prompt，其中明确要求：

- 感谢用户
- 解释 CRM 批准的下一步
- 以 `chatbotV2 context` 为真相来源
- 不要自己决定是否开启 hospital selection

这说明 starter 在 v2 中已经被收编成一个“受控引导回复”，不是自由创作。

#### 6. 用 post-turn logic 修正最终结构化状态

它调用：

- `buildChatbotV2PostTurnContext(...)`

用刷新后的 `session.statusSnapshot` 重算最终 `chatbotV2`

#### 7. 把最终结果写回 starter message

它把这些东西写入 message metadata：

- `widgetStarterSeed`
- `widgetStarterVersion`
- `draftState: succeeded`
- `internalNextAction`
- `chatbotV2`
- `classifierResult`

### 它怎么被当前 v2 使用

它服务的是 onboarding / case 建立后 widget 首次打开时的第一条 assistant 消息。

### 这个文件在 v2 的真实意义

它保证了“第一条消息”也不脱离 v2 控制面。

这点很重要，因为很多系统会把 starter 做成一套独立硬编码逻辑，结果第一条消息和后续 chat 主线完全不一致。当前 v2 则尽量避免这个问题。

---

## 这 8 个文件之间的依赖关系

可以把它们理解成下面这条链：

1. [composition-root.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/composition-root.ts)
   - 提供 repos / use cases / dedicated Dify clients
2. [get-ai-policy-context.use-case.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/use-cases/ai-policy/get-ai-policy-context.use-case.ts)
   - 把 CRM 当前 truth 组织成 foundation context
3. [chatbot-v2-context.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot-v2-context.ts)
   - 读取 foundation
   - 组织 classifier input
   - 调 classifier
   - 调 orchestrator
   - 形成 preTurn / postTurn
4. [llm-request-classifier.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/llm-request-classifier.service.ts)
   - 对 classifier 远程调用做结构化封装
5. [conversation-orchestrator.service.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/application/src/services/chatbot-v2/conversation-orchestrator.service.ts)
   - 把 classification 翻译成资源暴露和流程预推进
6. [chatbot.routes.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/chatbot.routes.ts)
   - 真正执行普通聊天 turn
7. [patient-widget-starter.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/apps/api/src/routes/patient-widget-starter.ts)
   - 真正执行 starter turn
8. [chat-journey.schema.ts](/Users/haowang/Desktop/medora-health-beauty/medical-crm-v2/packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts)
   - 作为整个链路的共享 contract 边界

---

## `request-classifier.service.ts` 还有没有必要存在

### 结论

没有必要。

### 原因

#### 1. 当前 v2 主链已经完全不走它

当前 v2 主链是：

- `chatbot-v2-context.ts`
- `LlmRequestClassifierService`
- `ConversationOrchestratorService`

而不是：

- route 内 fallback 到本地 rule-based classifier

#### 2. orchestrator 现在强制要求外部传 classifier output

这意味着：

- “如果没配 classifier 就用本地规则顶一下”的模式已经不再被允许

#### 3. 当前 runtime 源码里它已经不存在

目前 `packages/application/src/services/chatbot-v2/` 目录下已经没有这个文件。

也就是说，今天不是“还要不要保留”这个层面，而是：

- 它已经被 v2 实现事实性淘汰了

#### 4. 剩余命中主要是旧文档

现在仓库里和这个名字相关的命中主要来自：

- 旧 spec
- 旧 implementation plan
- 旧 analysis 文档

所以真正该做的不是“继续保留它”，而是：

- 清理文档里的过时描述

### 当前正确表述应该是什么

更准确的说法是：

- `request-classifier.service.ts` 曾经是 v2 早期迁移阶段的本地规则分类器
- 当前 v2 运行时已经改成 dedicated LLM classifier 主路径
- 该文件已无 runtime 作用，且已从源码中移除

---

## 最终判断

如果只看当前 v2 主链，这 8 个文件已经形成了一套很清晰的结构：

- `schema` 负责定义安全边界
- `getAiPolicyContext` 负责提供 CRM 真相
- `chatbot-v2-context` 负责组织单轮上下文
- `LLM classifier` 负责理解用户请求
- `orchestrator` 负责把请求翻译成 journey/resource 决策
- `chatbot.routes` 和 `patient-widget-starter` 负责把这套决策接进真实运行时

而 `request-classifier.service.ts` 在这套结构里已经没有位置了。

如果你后面还要继续做文档清理，我建议优先统一下面这个口径：

- 当前 `chatbot v2` 的分类器只有 `LlmRequestClassifierService` 这一条 runtime 主路径
- classifier 必须使用 dedicated `DIFY_CLASSIFIER_APP_API_KEY`
- FAQ grounding 是独立可选工作流
- `chatbotV2` envelope 才是 v2 的结构化真相

