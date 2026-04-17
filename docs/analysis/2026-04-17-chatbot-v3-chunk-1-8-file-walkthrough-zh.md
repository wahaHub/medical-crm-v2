# Chatbot V3 Chunk 1-8 改动思路总览（通俗版 + 文件级）

日期：2026-04-17  
范围：`feature/phase-2bc-chatbot-v3-exec` 分支上，Chunk 1-8 的“已完成基础建设”

---

## 先用一句话说完这 8 个 chunk

这 8 个 chunk 做的事可以理解成：

1. 先把 v3 的“数据契约”锁死（Chunk 1）
2. 再把“规则配置 + 决策引擎 + Supervisor 建议层”搭起来（Chunk 2-4）
3. 然后把“工具网关 + agent 执行 + turn runtime + API 路由”串起来（Chunk 5-7）
4. 最后补上“观测和告警”，保证线上可看、可追、可排障（Chunk 8）

你可以把它看成：
`协议层 -> 决策层 -> 执行层 -> 接口层 -> 可观测层` 的一条闭环落地路线。

---

## Chunk 对应提交（便于回溯）

| Chunk | 关键提交 | 核心目标 |
|---|---|---|
| 1 | `0f753c9` | 建立 v3 严格请求/响应 schema |
| 2 | `678cff3` | 建立可配置 policy model + parser |
| 3 | `c0ce7ed` | 落地 deterministic orchestrator 决策引擎 |
| 4 | `8b7c735` | 落地 Supervisor 建议服务 + safe fallback |
| 5 | `06a6e1b` | 建立 typed ToolGateway + bounded agents |
| 6 | `7941150` | 落地 turn runtime（幂等 + degrade） |
| 7 | `7bec447` | 挂载公开 `/api/v3/chatbot/chat` |
| 8 | `1d4bc71` | 落地 M0 observability（事件/指标/告警） |

---

## Chunk 1：先把“说话格式”锁住（Validation Contract）

通俗理解：
先规定“系统之间怎么说话”，否则后面所有逻辑都可能各说各话。

例子：
如果返回里混入了 v2 的 `nextAction`，Chunk 1 的测试会直接判错，不让它进主链路。

涉及文件与改动：

- `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
  - 新增 v3 聊天请求/响应 schema。
  - 定义 `turnOutcome`、`journey`、`cards` 等 v3 专属字段。
  - 显式拒绝 legacy 字段进入 v3 主响应。
- `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
  - 新增契约测试，覆盖“合法 v3 响应通过、legacy 字段拒绝”等关键路径。
  - 锁住 card 类型白名单，避免非法卡片类型漂进来。
- `packages/shared/validation/src/index.ts`
  - 导出 v3 schema/types，给 application/api/ui 统一复用。

---

## Chunk 2：把“规则配置”变成可解析、可校验、可默认

通俗理解：
把“流程规则”从散落在代码里的 if-else，收拢成可配置模型。

例子：
配置里写：`ONLINE_CONSULT` 需要 `recommendation.picked=true`，解析后 orchestrator 才知道何时允许放行。

涉及文件与改动：

- `packages/application/src/services/chatbot-v3/types.ts`
  - 新增 v3 运行时核心类型：stage、facts、policy、decision 输入输出模型。
  - 给后续 orchestrator/supervisor/runtime 提供共同语言。
- `packages/application/src/services/chatbot-v3/policy-config.service.ts`
  - 新增 policy parser：把输入配置解析成标准结构并填充默认值。
  - 落地 `globalPolicies`、`stagePrerequisites`、`jumpRules` 等基础模型。
- `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
  - 新增解析测试，确保配置字段可读且默认策略稳定。
- `packages/application/src/index.ts`
  - 导出上述类型和 parser，供 API 层调用。

---

## Chunk 3：把“谁能走下一步”交给 deterministic orchestrator

通俗理解：
Supervisor 只提建议，真正拍板“能不能走、走到哪”由 orchestrator 决定。

例子：
用户说“我想直接线上问诊”，但 `recommendation.picked=false`，orchestrator 会给 `STAY`，并附原因，不会跳步。

涉及文件与改动：

- `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
  - 新增决策引擎：处理 handoff 优先级、explain gate、prerequisite gating、jump 许可。
  - 产出结构化 decision（action/from/to/dispatch/whyNotSkip）。
- `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`
  - 新增优先级和 gating 回归测试，确保“建议 != 最终决定”。
  - 覆盖典型拒绝场景（缺 prerequisite、跳过 explain、handoff 条件不满足）。

---

## Chunk 4：让 Supervisor 变成“可用建议层”，但不拥有写权限

通俗理解：
Supervisor 相当于“导航建议员”：给建议，但不能自己改 journey state。

例子：
LLM 输出脏数据或超时时，Supervisor 自动退回 heuristic，不会把 runtime 卡死。

涉及文件与改动：

- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - 新增 suggestion service，支持 gateway/LLM 输出清洗。
  - 严格限定输出只包含 suggestion 字段，不允许夹带 dispatch/state mutation。
  - 失败时 fallback 到 deterministic heuristic。
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - 新增建议层测试：输出约束、reason 长度约束、fallback 行为。

---

## Chunk 5：把“能调用什么工具”收口成 ToolGateway + 有边界 Agent

通俗理解：
每个 agent 只拿到自己该拿的工具，不能随意越权调用。

例子：
FaqAgent 只能走 FAQ 相关工具；ConsultAgent 不能直接去改推荐结果。

涉及文件与改动：

- `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
  - 新增 typed ToolGateway，定义 records/recommendation/consult/status 等能力面。
  - 统一 `ToolResult` 正常/异常输出，包含错误码归一。
- `apps/api/src/routes/chatbot-v3/agents.ts`
  - 新增/补齐 `FaqAgent`、`RecordsAgent`、`RecommendationAgent`、`ConsultAgent`、`HandoffAgent` 执行入口。
  - 将工具调用边界固定在 agent runtime 内。
- `apps/api/src/composition-root.ts`
  - 注入 v3 agent/tool 所需依赖。
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - 新增 gateway/agent 能力面测试，验证工具矩阵完整且输出规范。

---

## Chunk 6：把“单轮 turn”做成可靠 runtime（幂等 + 降级）

通俗理解：
同一轮请求重复打进来不会写乱状态；agent/tool 失败时返回可恢复的 degraded 结果，而不是直接炸接口。

例子：
同一个 `sessionId+turnId` 重试 2 次，最终只有一次真实执行，另一次拿幂等结果；若工具超时则走 `status.query` 的保守降级路径。

涉及文件与改动：

- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - 新增 turn pipeline：Supervisor suggest -> Orchestrator decide -> Dispatch agent -> Compose runtime result。
  - 接入 idempotency key 执行器，保证同 turn 幂等。
  - 增加 recoverable degrade fallback 分支。
- `apps/api/src/composition-root.ts`
  - 增加 runtime 对 idempotency executor 的依赖注入。
- `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
  - 新增并发/幂等/超时降级回归测试。

---

## Chunk 7：正式开出 `/api/v3/chatbot/chat` 公共入口

通俗理解：
把前面做好的 runtime 真正挂到公开路由，形成可调用产品能力。

例子：
客户端调用 `/api/v3/chatbot/chat`，返回 v3-only 响应，不再依赖 v2 的 `nextAction/secondaryAction/blocks`。

涉及文件与改动：

- `apps/api/src/routes/chatbot-v3.routes.ts`
  - 新增 v3 public route，处理 request 解析、runtime 调用、response 返回。
  - 将 v3 contract 与 runtime 对齐，形成稳定对外入口。
- `apps/api/src/index.ts`
  - 挂载 v3 public routes。
- `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
  - 新增挂载与公开行为测试，确保 v3 路由可访问、响应字段正确。

---

## Chunk 8：补齐 M0 可观测性（事件、指标、阈值告警）

通俗理解：
让这套多节点 runtime“可看见”：每轮发生了什么、哪里慢、哪里失败、什么时候该告警。

例子：
若 `consult.schedule` 失败率在窗口内超阈值，会触发对应规则告警，而不是靠人工拍脑袋发现。

涉及文件与改动：

- `apps/api/src/routes/chatbot-v3/observability.ts`
  - 新增结构化事件发射器、窗口指标聚合、阈值规则评估。
  - 覆盖 supervisor/orchestrator/subagent/tool/turn_summary 关键事件面。
- `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
  - 新增可观测性回归测试：事件字段完整性、指标聚合、告警触发。
- `docs/analysis/2026-04-15-chatbot-v3-m0-observability-checklist.md`
  - 新增非生产验证清单，指导 staging 验证和上线前检查。

---

## Chunk 1-8 全量文件清单（去重）

1. `packages/shared/validation/src/chatbot-v3/chat.schema.ts`
2. `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts`
3. `packages/shared/validation/src/index.ts`
4. `packages/application/src/services/chatbot-v3/types.ts`
5. `packages/application/src/services/chatbot-v3/policy-config.service.ts`
6. `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts`
7. `packages/application/src/index.ts`
8. `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
9. `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts`
10. `packages/application/src/services/chatbot-v3/supervisor.service.ts`
11. `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
12. `apps/api/src/routes/chatbot-v3/tool-gateway.ts`
13. `apps/api/src/routes/chatbot-v3/agents.ts`
14. `apps/api/src/composition-root.ts`
15. `apps/api/src/__tests__/chatbot-v3.routes.test.ts`
16. `apps/api/src/routes/chatbot-v3/runtime.service.ts`
17. `apps/api/src/routes/chatbot-v3.routes.ts`
18. `apps/api/src/index.ts`
19. `apps/api/src/__tests__/chatbot-v3.mounting.test.ts`
20. `apps/api/src/routes/chatbot-v3/observability.ts`
21. `apps/api/src/__tests__/chatbot-v3.observability.test.ts`
22. `docs/analysis/2026-04-15-chatbot-v3-m0-observability-checklist.md`

---

## 给你的一句“项目进度话术”（可直接复用）

Chunk 1-8 已经把 v3 从“设计稿”推进到了“可运行、可测试、可观测”的工程化骨架：
- 契约、决策、执行、路由、观测都已有实现和测试。
- 后续迭代主要是收口 authority 单写入、补齐 supervisor-led canonical 细节、以及提升 worker 质量，而不是从 0 到 1 重写。


---

## 2026-04-17 增补：Chunk 8 residual / Chunk 0 residual

这一段是对前文 chunk 1-8 的补充收口，不是重写 chunk 定义。

### Chunk 8 residual（worker task contract）

结论：**已收口**。

通俗说法：
之前像是“给 worker 发一段格式约定字符串，让它自己猜字段”；现在改成“给 worker 一个结构化任务对象，字段类型固定，谁都别猜”。

主要落点：

- `apps/api/src/routes/chatbot-v3/worker-task.ts`
  - 新建结构化 `WorkerTask` 合同（Faq/Records/Recommendation 三类）。
- `apps/api/src/routes/chatbot-v3/runtime.service.ts`
  - 统一由 runtime 构建 typed task 并塞进 `meta.task`。
- `apps/api/src/routes/chatbot-v3/agents.ts`
  - agent 执行入口消费 `meta.task?: WorkerTask`，不再依赖隐式字符串协议。
- `apps/api/src/routes/chatbot-v3/faq-prompts.ts`
- `apps/api/src/routes/chatbot-v3/records-prompts.ts`
- `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts`
  - prompt 构建从“taskPrompt 字符串拆解”下沉为“直接消费结构化 task 字段”。

对应测试证据（示例）：

- `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts`
  - 显式验证“使用 structured recommendation task metadata，而不是解析 taskPrompt 文本”。

### Chunk 0 residual（execution baseline + fail-fast guard）

结论：**已收口**。

通俗说法：
现在每次跑根测试前，先做一遍“v3 baseline 壳文件存在性检查”；缺关键壳文件会立即 fail-fast，避免在错误基线上继续开发。

主要落点：

- `docs/analysis/2026-04-17-chatbot-v3-execution-baseline.md`
  - baseline 说明文档。
- `scripts/check-chatbot-v3-baseline-shell.mjs`
  - baseline guard 脚本。
- `scripts/check-chatbot-v3-baseline-shell.test.mjs`
  - guard 单测（包含 root test 顺序校验）。
- `package.json`
  - 根 `test` 脚本已前置 `check:chatbot-v3-baseline-shell`。

### 最新收口状态（2026-04-17，`a07da99`）

上一版里提到的 fallback gap 已被修复：

- `packages/application/src/services/chatbot-v3/supervisor.service.ts`
  - 当 `recommendation.selected=true && process.explained!==true` 时，先建议 `EXPLAIN_PROCESS`
  - 仅在 `process.explained=true` 后建议 `ONLINE_CONSULT`
- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts`
  - 已补对应回归测试，覆盖两条分支

另外，`process.explained` 主写入链路已是 authority factsPatch + runtime 展示边界校验，不再由旧 composer helper 驱动。

所以当前真实状态是：

- `Chunk 8 residual`: closed
- `Chunk 0 residual`: closed
- `Supervisor fallback stall P1`: closed
