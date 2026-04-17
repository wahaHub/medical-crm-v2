# Chatbot V3 Supervisor-Led 实现审阅报告（Rerun v3）

Date: 2026-04-17  
Workspace: `/Users/haowang/Desktop/claws/medical-crm-v2/.worktrees/chatbot-v3-exec`

## 审阅范围

本轮是对你指定的修复点做复审：

- `process.explained` 是否已经从“composer 语义触发写入”改为“authority write 驱动 + runtime 边界校验”。
- 修复后是否引入新回归。
- 同步更新当前进度文档。

## 结论（先说结论）

你这次针对 `process.explained` 的修改，**核心目标已达成**：

- 旧路径（`didShowExplicitProcessExplanation` 直接驱动写入）已退出主写入链路。
- 写入源已切换到 `decision.write.factsPatch`（authority 输出）并在 runtime 侧进行 `PROCESS_OVERVIEW` 边界校验。
- route 不再手工 `delete statusPatch.processExplained` / `if writeIntents.processExplained` 这类二次写入逻辑。

因此，之前那条 finding：

> `[P1] process.explained 仍由 composer 语义触发`

在当前代码状态下可以标记为 **Closed**。

## 复审证据（process.explained）

### 1) 写入源已改为 authority write

- `runtime.service.ts` 中 `deriveCanonicalTruthPatch()` 已读取 `result.decision.write?.factsPatch`，并把 canonical key 映射到状态字段。
- `process.explained` 的写入只有在 `factsPatch['process.explained'] === true` 且 `render.path === 'PROCESS_OVERVIEW'` 时才落 patch。

这说明“是否可写”由 authority 给出，“是否真正展示了显式流程说明”由 runtime render path 做保护。

### 2) route 侧旧的 process 专用写入逻辑已删除

- `chatbot-v3.routes.ts` 当前持久化不再有：
  - `delete statusPatch.processExplained`
  - `if (result.writeIntents?.processExplained) ...`
- 改为统一消费：`result.writeIntents?.canonicalTruthPatch`。

### 3) 对应测试已覆盖“写入”和“不误写”

`chatbot-v3.routes.test.ts` 已有用例覆盖：

- authority 给出 `process.explained=true` 且走 `PROCESS_OVERVIEW` 时，发出 `canonicalTruthPatch.processExplained=true`。
- FAQ answer 停留在 explain stage 时，不应写 `processExplained`（patch 为空）。

## 本轮发现的剩余问题（未修复）

### [P1] 旧 orchestrator compatibility shell 仍在 live route 主链路

- 现状：`chatbot-v3.routes.ts` 的 runtime wiring 仍通过 `new OrchestratorV3Service().decide(...)` 包装调用。
- 直接影响：挂载测试新增“live route 不应经过 orchestrator compatibility shell”断言后，会触发 500。

这与“删掉旧控制平面真相”的 canonical 方向仍冲突。

### [P1] conversationSummary ownership 仍有 split（runtime 已产 patch，但 route 仍重算）

- 现状：
  - runtime `writeIntents` 已包含 `conversationSummaryPatch`（含 contract + statusPatch）。
  - route 仍调用本地 `buildConversationSummaryPatch(...)` 重算 summary，而非消费 runtime 产物。
- 影响：ownership 边界仍不完全收口，contract 一致性仍有风险。

## 测试结果（本轮）

已跑关键回归：

- `@medical-crm/application`
  - `journey-runtime-authority.service.test.ts`
  - `orchestrator-v3.service.test.ts`
  - 结果：`27 passed`

- `@medical-crm/api`
  - `chatbot-v3.routes.test.ts`
  - `chatbot-v3.mounting.test.ts`
  - `response-composer.test.ts`
  - 结果：`84 passed, 1 failed`
  - 失败点：`does not route live authority decisions through the orchestrator compatibility shell`

## 更新后的进度判断

- `process.explained` 写入边界：**已修复并可关闭**。
- 当前主要阻塞已转为：
  1. live route 仍经过 orchestrator compatibility shell；
  2. summary patch ownership 尚未完全 runtime-only 收口。

如果下一步继续按 canonical 收口，建议优先先做第 1 点（去掉 live route 上的 OrchestratorV3 compatibility wrapper）。
