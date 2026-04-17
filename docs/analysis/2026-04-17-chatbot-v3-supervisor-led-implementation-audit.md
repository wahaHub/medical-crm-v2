# Chatbot V3 Supervisor-Led 实现审阅报告（Rerun v6）

Date: 2026-04-17
Workspace: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec`
Reviewed commit line: `feature/phase-2bc-chatbot-v3-exec` (`HEAD=a07da99`)

## 总结结论

基于本轮复审（含 `requesting-code-review` 流程）结果：

- Finding 1 / Finding 3（Supervisor fallback 停滞）：**Closed**
- Finding 2（`process.explained` 仍由 composer 语义触发）：**Closed（原陈述已过时）**
- 本轮未发现新的 authority / persistence P0 / P1 回归。

更准确地说，当前状态应视为：`Chunk 8 residual` + `Chunk 0 residual` + 本轮 P1 fallback 修复主链路已收口；当前文档不再将 `ONLINE_CONSULT -> RECOMMENDATION` degraded-guidance label 视为未关闭项。

## 关闭项证据

### 1) Fallback 停滞（Finding 1 & 3）已修复

修复后的 fallback 顺序：

- 当 `recommendation.selected=true && process.explained!==true` 时，优先建议 `EXPLAIN_PROCESS`
- 仅在 `process.explained=true` 后建议 `ONLINE_CONSULT`

代码证据：

- `packages/application/src/services/chatbot-v3/supervisor.service.ts:167-180`

回归测试证据：

- `packages/application/src/services/__tests__/chatbot-v3/supervisor.service.test.ts:62-131`
  - 覆盖“先 EXPLAIN_PROCESS”分支
  - 覆盖“已 explained 才 ONLINE_CONSULT”分支

### 2) Finding 2（composer 驱动写入）原陈述已过时

当前主写入路径并非 `didShowExplicitProcessExplanation(...)` 驱动：

- `process.explained` 来自 authority `write.factsPatch`，并由 runtime 在显式流程展示路径上做边界校验后持久化
- `didShowExplicitProcessExplanation(...)` 仍在 `response-composer.ts`，但不在主写入链路上被调用

代码证据：

- authority patch 进入 canonical truth patch：
  - `apps/api/src/routes/chatbot-v3/runtime.service.ts:1114-1132`
- `process.explained` 只在 `PROCESS_OVERVIEW` 展示路径下允许落库：
  - `apps/api/src/routes/chatbot-v3/runtime.service.ts:1120-1122`
- route 仅消费 runtime `writeIntents` 持久化：
  - `apps/api/src/routes/chatbot-v3.routes.ts:127-138`
- `didShowExplicitProcessExplanation(...)` 无 runtime/route 调用点（仅保留在 composer/test 语义层）

说明：
`render.path` 校验仍属于 runtime 的显式展示边界控制，符合 canonical“必须真正展示流程说明后才写入 process.explained”的约束。

## 本轮执行验证

已执行：

- `pnpm --filter @medical-crm/application test -- src/services/__tests__/chatbot-v3/supervisor.service.test.ts src/services/__tests__/chatbot-v3/journey-runtime-authority.service.test.ts`
  - 结果：`38 passed`
- `pnpm --filter @medical-crm/api test -- src/__tests__/chatbot-v3.mounting.test.ts src/__tests__/chatbot-v3.routes.test.ts src/routes/chatbot-v3/response-composer.test.ts`
  - 结果：`88 passed`
- `pnpm --filter @medical-crm/api test -- src/routes/chatbot-v3/faq-llm-adapter.test.ts src/routes/chatbot-v3/records-llm-adapter.test.ts src/routes/chatbot-v3/recommendation-llm-adapter.test.ts src/routes/chatbot-v3/faq-route-adapter.test.ts src/routes/chatbot-v3/records-route-adapter.test.ts src/routes/chatbot-v3/recommendation-route-adapter.test.ts`
  - 结果：`18 passed`
- `node --test scripts/check-chatbot-v3-baseline-shell.test.mjs`
  - 结果：`4 passed`

## 最终状态快照

- `Chunk 8 residual`: closed on main path
- `Chunk 0 residual`: closed on main path
- `Fallback stalls before EXPLAIN_PROCESS`: closed
- `process.explained still composer-driven`（按原 finding 表述）：closed
- `response-composer degraded guidance labeling`: closed for the `ONLINE_CONSULT -> RECOMMENDATION` revisit failure case covered by current code/tests
