# Chatbot V3 Supervisor-Led 逐文件改动账本（按 contract 对齐）

日期：2026-04-17  
代码范围：`ffcd822..a07da99`（以 supervisor-led 落地与 residual 收口为主）  
Canonical 设计文档（驱动源）：`/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-16-chatbot-v3-supervisor-led-contract-design.md`

## 说明

这份文档不是 chunk 总览，而是逐文件账本。

每条文件都回答三件事：

1. 改了什么
2. 为什么改
3. 对应 contract 哪条

### Contract 条款缩写

- `§2`：Supervisor 主导 + JourneyRuntimeAuthority 单一 final writer
- `§3`：主 journey 顺序（先 minimal triage）
- `§4`：阶段规则（proactive、repeat/revisit、explain once by default）
- `§5`：minimal medical triage 由 RecordsAgent 负责
- `§6`：pre-chat intake seed
- `§7`：Supervisor minimal context + 按域读取 + summary contract
- `§8`：最小 canonical truth flags + 持久化/回放 contract
- `§9`：Supervisor 输出 contract（intent/stage/agent/reason/task）
- `§10`：Supervisor-facing agent registry（When to use/Task style/Send these facts）
- `§11`：runtime-facing allowlist（按 agent 限工具域）
- `§12`：domain truth 职责边界，route 不能变第二真相 writer

---

## A. API 路由与 runtime（31 files）

| File | 改动内容（逐文件） | Contract 对齐 |
|---|---|---|
| `apps/api/src/__tests__/chatbot-v3.mounting.test.ts` | 大量补充 live route 集成回归：triage-first、authority 写入、summary 持久化、handoff、process explain 写入边界、runtimeDebug 暴露策略。 | `§2 §3 §4 §7 §8 §12` |
| `apps/api/src/__tests__/chatbot-v3.observability.test.ts` | 锁 node events 与 turn_summary 字段，验证 supervisor/authority/subagent/tool 事件链闭环。 | `§2 §7` |
| `apps/api/src/__tests__/chatbot-v3.routes.test.ts` | 增加 runtime/service 行为测试：authority patch 消费、worker task、triage 锁、fallback、route 写入拼装边界。 | `§2 §3 §5 §8 §12` |
| `apps/api/src/composition-root.ts` | 暴露/注入 supervisor-led runtime 依赖（authority、adapters、idempotency 等）供 v3 route 使用。 | `§2 §7 §11` |
| `apps/api/src/routes/chatbot-v2-context.ts` | v2 truth 计算对齐 canonical truth flag 命名（尤其 recommendation/process 相关）。 | `§8` |
| `apps/api/src/routes/chatbot-v3.routes.ts` | 主链路切到 JourneyRuntimeAuthority adapter；route 仅消费 runtime write intents 持久化，不再自持双真相写入。 | `§2 §8 §12` |
| `apps/api/src/routes/chatbot-v3/agents.ts` | Faq/Records/Recommendation 走 LLM worker；Consult/Handoff 保持 deterministic；统一消费结构化 worker task。 | `§2 §4 §5 §11 §12` |
| `apps/api/src/routes/chatbot-v3/faq-llm-adapter.test.ts` | FAQ worker 计划/回答结构化输出、fallback、安全约束回归。 | `§4 §10 §11` |
| `apps/api/src/routes/chatbot-v3/faq-llm-adapter.ts` | FAQ 计划与回答双阶段 adapter；对 schema 失败/异常进行 deterministic fallback。 | `§4 §10 §11` |
| `apps/api/src/routes/chatbot-v3/faq-prompts.ts` | FAQ prompt 改为消费 structured worker task，而非隐式字符串协议。 | `§7 §9 §10` |
| `apps/api/src/routes/chatbot-v3/faq-route-adapter.test.ts` | 覆盖 FAQ route adapter 的外部模型调用、超时与 fallback。 | `§10 §11` |
| `apps/api/src/routes/chatbot-v3/observability.ts` | 增加/收敛 node-level 事件字段，支撑 supervisor-led replay/debug 线索。 | `§2 §7` |
| `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.test.ts` | 覆盖 recommendation worker 的 structured task、fallback、输出约束、防跨域污染。 | `§4 §9 §11 §12` |
| `apps/api/src/routes/chatbot-v3/recommendation-llm-adapter.ts` | Recommendation 由“占位”升级为真实 worker adapter，带 schema 清洗和 fallback。 | `§4 §9 §11` |
| `apps/api/src/routes/chatbot-v3/recommendation-prompts.ts` | recommendation prompt 绑定 structured task（generate/refresh/revisit/compare/explain）。 | `§4 §9 §10` |
| `apps/api/src/routes/chatbot-v3/recommendation-route-adapter.test.ts` | 覆盖 recommendation route adapter 模型调用/解析/fallback。 | `§4 §11` |
| `apps/api/src/routes/chatbot-v3/recommendation-route-adapter.ts` | OpenAI route adapter，输出受约束 JSON，失败自动降级。 | `§4 §11` |
| `apps/api/src/routes/chatbot-v3/records-llm-adapter.test.ts` | 覆盖 records worker 的 minimal triage/medical collection 两模式与 fallback。 | `§5 §11` |
| `apps/api/src/routes/chatbot-v3/records-llm-adapter.ts` | Records worker LLM 化：判断 triage 完成、追问缺失字段、collection 提示。 | `§5 §12` |
| `apps/api/src/routes/chatbot-v3/records-prompts.ts` | 明确三问最小分诊 prompt 与 collection prompt。 | `§5 §10` |
| `apps/api/src/routes/chatbot-v3/records-route-adapter.test.ts` | 覆盖 records route adapter 的结构化返回、collection prompt 版本、fallback。 | `§5 §11` |
| `apps/api/src/routes/chatbot-v3/records-route-adapter.ts` | Records LLM route adapter（超时、解析、fallback）。 | `§5 §11` |
| `apps/api/src/routes/chatbot-v3/response-composer.test.ts` | 覆盖 FAQ/流程说明/handoff/degraded 响应组装语义。 | `§4 §12` |
| `apps/api/src/routes/chatbot-v3/response-composer.ts` | 响应 envelope 统一组装；`didShowExplicitProcessExplanation` 保留为展示语义 helper。 | `§4 §12` |
| `apps/api/src/routes/chatbot-v3/runtime.service.ts` | Supervisor 输入最小化、按域读、authority 决策、writeIntent 生成、triage-first stage 推导、process.explained 写入边界、structured worker task。 | `§2 §3 §4 §5 §7 §8 §9 §12` |
| `apps/api/src/routes/chatbot-v3/supervisor-prompt.test.ts` | 锁 Supervisor prompt 的最小上下文与 registry 注入语义。 | `§7 §10` |
| `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts` | Supervisor prompt 明确：最小输入、可选域读取、authority final writer、三行 registry。 | `§2 §7 §9 §10` |
| `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.test.ts` | Supervisor route adapter 的结构化输出、异常/fallback 行为测试。 | `§7 §9` |
| `apps/api/src/routes/chatbot-v3/supervisor-route-adapter.ts` | Supervisor LLM adapter：严格 JSON 输出、超时控制、最小模型接口。 | `§7 §9` |
| `apps/api/src/routes/chatbot-v3/tool-gateway.ts` | 明确 agent->tool 域能力面（faq/recommendation/records/consult/handoff/status），为 runtime allowlist 提供执行边界。 | `§11` |
| `apps/api/src/routes/chatbot-v3/worker-task.ts` | 新增结构化 worker task contract（Faq/Records/Recommendation）及 fallback task builder。 | `§9 §10 §11` |

---

## B. Application 层（13 files）

| File | 改动内容（逐文件） | Contract 对齐 |
|---|---|---|
| `packages/application/src/index.ts` | 导出 supervisor-led 新类型与服务（authority、minimal intake、registry 等）。 | `§2 §6 §7 §9` |
| `packages/application/src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts` | authority allow/deny/write 合同回归（stage gate、factsPatch、handoff、consult prerequisite）。 | `§2 §3 §4 §8 §12` |
| `packages/application/src/services/__tests__/chatbot-v3/llm-adapter.types.test.ts` | adapter contract 测试，锁 supervisor/worker 结构化 I/O。 | `§7 §9` |
| `packages/application/src/services/__tests__/chatbot-v3/orchestrator-v3.service.test.ts` | compatibility orchestrator 与 authority 规则一致性回归。 | `§2 §3` |
| `packages/application/src/services/__tests__/chatbot-v3/policy-config.service.test.ts` | policy 解析与默认值回归（stage prerequisites、handoff rules）。 | `§4 §8` |
| `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts` | 增加 Supervisor 最小上下文、域读取、task 输出、fallback 顺序（含 `a07da99` 的 explain-before-consult 修复）。 | `§7 §9 §10` |
| `packages/application/src/services/chatbot-v2/journey-truth.service.ts` | v2 truth 读取对齐 canonical truth flags（减少语义漂移）。 | `§8` |
| `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts` | 落地 single final writer：决策 + dispatch allow/deny + write.factsPatch；关掉 route 双写真相。 | `§2 §8 §12` |
| `packages/application/src/services/chatbot-v3/minimal-intake.types.ts` | 新增 pre-chat intake 最小字段类型（condition/destination/language/gender）。 | `§6 §7` |
| `packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts` | orchestrator 降级为 compatibility shell，内部转调 authority，阻止旧 policy override 成为第二真相。 | `§2 §12` |
| `packages/application/src/services/chatbot-v3/supervisor-registry.ts` | 实现 Supervisor-facing 三行 registry 文本（When to use / Task style / Send these facts）。 | `§10` |
| `packages/application/src/services/chatbot-v3/supervisor.service.ts` | Supervisor suggestion-only contract、最小上下文输入、域读取请求、task 生成、`a07da99` fallback 修复（先 explain 后 consult）。 | `§4 §7 §9 §10` |
| `packages/application/src/services/chatbot-v3/types.ts` | 重建 supervisor-led 核心类型：journey order、authority interfaces、summary contract、domain reads、default policy。 | `§2 §3 §7 §8 §9` |

---

## C. Domain / Infra 持久化（9 files）

| File | 改动内容（逐文件） | Contract 对齐 |
|---|---|---|
| `packages/domain/__tests__/ai-chat-session.entity.test.ts` | canonical truth flags 映射、legacy 修复策略、minimal triage 不被旧证据误判的回归。 | `§8` |
| `packages/domain/src/entities/ai-chat-session.entity.ts` | 增加 canonical truth map/flags/patch 推导函数，统一读写 `records.minimal_triage.complete` 等真值。 | `§8` |
| `packages/domain/src/enums/index.ts` | journey stage 枚举补齐 `COLLECT_MINIMAL_MEDICAL_FACTS`。 | `§3 §5` |
| `packages/domain/src/index.ts` | 导出 canonical truth 相关类型与工具函数。 | `§8` |
| `packages/infrastructure/database/migrations/031_ai_chat_canonical_truth_flags.sql` | 新增 canonical truth 持久化列（初版）。 | `§8` |
| `packages/infrastructure/database/migrations/032_ai_chat_canonical_truth_flags_nullable.sql` | 调整 canonical truth 列可空/迁移安全策略。 | `§8` |
| `packages/infrastructure/database/migrations/033_ai_chat_canonical_truth_flags_repair.sql` | 对历史 session 做 canonical truth repair/backfill。 | `§8` |
| `packages/infrastructure/database/repositories/drizzle-ai-chat-session.repository.ts` | repository 层读写 canonical truth 字段与 summary/timestamps。 | `§7 §8` |
| `packages/infrastructure/database/schema/schema.ts` | schema 对齐 canonical truth 持久化列。 | `§8` |

---

## D. Validation 契约（4 files）

| File | 改动内容（逐文件） | Contract 对齐 |
|---|---|---|
| `packages/shared/validation/src/__tests__/chatbot-v2/chat-journey.schema.test.ts` | v2 journey schema 与新增 stage 兼容测试。 | `§3` |
| `packages/shared/validation/src/__tests__/chatbot-v3/chat.schema.test.ts` | v3 严格契约回归：v3-only 字段、runtimeDebug、card/action 限制。 | `§9` |
| `packages/shared/validation/src/chatbot-v2/chat-journey.schema.ts` | v2 schema 补齐新 stage 枚举。 | `§3` |
| `packages/shared/validation/src/chatbot-v3/chat.schema.ts` | v3 请求/响应 schema 更新，`lastDispatchSource` 明确为 `journey-runtime-authority`。 | `§2 §9` |

---

## E. 文档 / 脚本 / 根命令（5 files）

| File | 改动内容（逐文件） | Contract 对齐 |
|---|---|---|
| `docs/analysis/2026-04-17-chatbot-v3-execution-baseline.md` | 记录 supervisor-led 执行基线与 residual 收口状态。 | `§2 §8` |
| `docs/analysis/2026-04-17-chatbot-v3-supervisor-led-implementation-audit.md` | 持续审阅记录：authority 写入边界、fallback 行为、回归验证结果。 | `§2 §4 §8 §12` |
| `package.json` | 根 `test` 前置 baseline guard（`check:chatbot-v3-baseline-shell`）。 | `§8` |
| `scripts/check-chatbot-v3-baseline-shell.mjs` | baseline shell 存在性 fail-fast guard，防止脱离 canonical runtime 壳执行。 | `§2 §8` |
| `scripts/check-chatbot-v3-baseline-shell.test.mjs` | guard 脚本与 root test 链路顺序回归。 | `§8` |

---

## F. 你关心的“新 contract-design 文档改动”如何落到代码

`2026-04-16-chatbot-v3-supervisor-led-contract-design.md`（主仓 canonical）在本次代码中对应的关键落点如下：

| Spec 要点 | 代码落点 |
|---|---|
| Supervisor 是 main LLM agent；Authority 是 single final writer | `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`, `apps/api/src/routes/chatbot-v3.routes.ts`, `apps/api/src/routes/chatbot-v3/runtime.service.ts` |
| 主 journey 顺序以 minimal triage 开始 | `packages/application/src/services/chatbot-v3/types.ts`, `apps/api/src/routes/chatbot-v3/runtime.service.ts` |
| triage 由 RecordsAgent 负责，Supervisor 不看 triage 细节 | `apps/api/src/routes/chatbot-v3/records-llm-adapter.ts`, `apps/api/src/routes/chatbot-v3/records-prompts.ts`, `packages/application/src/services/chatbot-v3/supervisor.service.ts` |
| Supervisor 默认最小上下文 + 按域读取 | `packages/application/src/services/chatbot-v3/supervisor.service.ts`, `apps/api/src/routes/chatbot-v3/supervisor-prompt.ts` |
| conversationSummary runtime-owned contract | `packages/application/src/services/chatbot-v3/types.ts`, `apps/api/src/routes/chatbot-v3/runtime.service.ts`, `apps/api/src/routes/chatbot-v3.routes.ts` |
| 两层 registry（Supervisor-facing 文本 vs runtime allowlist） | `packages/application/src/services/chatbot-v3/supervisor-registry.ts`, `apps/api/src/routes/chatbot-v3/tool-gateway.ts` |
| Recommendation / Records LLM 化；Consult/Handoff deterministic | `apps/api/src/routes/chatbot-v3/agents.ts` + `recommendation-*` + `records-*` |
| process.explained 写入必须与显式流程说明路径绑定 | `packages/application/src/services/chatbot-v3/journey-runtime-authority.service.ts`, `apps/api/src/routes/chatbot-v3/runtime.service.ts` |

