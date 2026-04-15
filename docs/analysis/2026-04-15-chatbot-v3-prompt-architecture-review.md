# Chatbot V3 Prompt 架构审视与最小改造建议（Orchestrator + 多 Agent）

## 1. 结论先说

当前 `chatbot-v3` 的主干方向是对的：

- `Orchestrator` 最终拍板（状态机决策）
- `Supervisor` 只建议（不改状态）
- 子 agent 执行被限制为工具调用（不直连仓库/DB）

但从 **prompt 设计** 角度看，当前仍是「半成品」：

1. `Supervisor` 还没有正式的 LLM prompt contract（现在主要是 heuristic + sanitize）。
2. 主 agent 下发给子 agent 的 `taskPrompt` 目前更偏 debug 标签，任务语义不够完整。
3. 子 agent 目前是 deterministic tool wrapper（这在 M0 是好事），但如果未来切 LLM 子 agent，缺少“每个 agent 的最小 prompt 模板 + allowlist 约束”会很容易漂移。

我的建议：**不推翻架构，做最小补强**。先把 prompt contract 定义清楚，再决定是否启用 LLM supervisor / LLM 子 agent。

---

## 2. 你们 v3 当前实现（代码现状）

### 2.1 Supervisor

- 入口：`packages/application/src/services/chatbot-v3/supervisor.service.ts`
- 现状：`suggest(input)` 支持 gateway，但默认是 heuristic fallback。
- 保证：`sanitizeSuggestionOnly()` 强制输出只保留 `intent/suggestedStage/reason`，不会泄漏 journey mutation 字段。

评价：**方向正确**（建议层与决策层分离），但“LLM supervisor 提示词协议”还没落地。

### 2.2 Orchestrator

- 入口：`packages/application/src/services/chatbot-v3/orchestrator-v3.service.ts`
- 现状：硬门槛/跳步规则/handoff 策略都在这里；`dispatchSource='orchestrator'`。

评价：**是正确的 authority 位置**，应继续保持。

### 2.3 主 agent -> 子 agent 的上下文

- 入口：`apps/api/src/routes/chatbot-v3/runtime.service.ts` 的 `buildTaskPrompt()`
- 当前 `taskPrompt` 字段：`agent/from/to/intent/supervisor_reason/facts`

评价：比“只传 userMessage 一条”好很多；但如果做执行质量优化，建议再补一个最小任务语义层（见第 4 节）。

### 2.4 子 agent 实现形态

- 入口：`apps/api/src/routes/chatbot-v3/agents.ts`
- 现状：子 agent 是 typed dispatcher（`FaqAgent/RecordsAgent/...`），不直接跑 LLM prompt。

评价：**这非常符合最小可用原则**。M0 不需要强行把每个子 agent 都 LLM 化。

---

## 3. 其他 agent 项目可迁移经验（目录对照）

## 3.1 DeerFlow

- 主 agent prompt 显式包含“decompose/delegate/synthesize”策略，且并发上限不是只靠 prompt，而有 middleware 限流。
- `task` 工具要求 `description + prompt + subagent_type`，子 agent 自身有独立 `system_prompt` 与 `disallowed_tools`。
- MCP 工具是动态发现 + 前缀化 + 配置筛选（include/exclude）。

可借鉴点：**主提示词 + 运行时硬约束双保险**，而不是只相信 prompt。

## 3.2 nanobot

- 主 prompt 由 identity/bootstrap/memory/skills 分层拼装。
- 子 agent prompt 非常聚焦：只做任务，不让它接管对外沟通。
- `spawn` 工具输入极简（task + label），避免子 agent 输入协议膨胀。

可借鉴点：**子 agent 上下文极简、任务导向**；对你们“不给 history 给子 agent”的方向是正向验证。

## 3.3 hermes-agent

- `delegate_task` 里对子 agent 有明确 blocked tools、深度限制、toolset 继承/收缩策略。
- 子 prompt 是 goal/context/workspace 三段式，强调不猜路径、只做被委托任务。
- MCP 工具被注册为独立 toolset，并注入到默认工具集合。

可借鉴点：**子 agent 工具权限要可计算、可验证**，不是“自然语言约束”。

## 3.4 spacebot

- Channel（对话）与 Worker（执行）使用完全不同 prompt，角色边界非常硬。
- Worker 通过 `set_status(kind="outcome")` 才能终态收敛，避免“没做完就说完了”。

可借鉴点：**执行代理需要终态信号与可观测性，不只是一段自由文本回复**。

---

## 4. 我建议怎么搞（最小可用版本）

## 4.1 不改的（保持）

1. **Orchestrator 最终拍板** 不变。  
2. 子 agent 继续保持 deterministic tool wrapper（M0 不 LLM 化）。  
3. 不给子 agent 传 history（继续只给任务上下文）。  

## 4.2 需要补的（最小）

1. 增加 `Supervisor Prompt Contract v1`（仅当启用 supervisor gateway 时使用）：
   - 输入：`current stage/phase + latest user message + facts + handoff signals + allowed stages`
   - 输出严格 JSON：`{ intent, suggestedStage, reason }`
   - 明确禁止：返回 dispatch/tool/state mutation 字段
   - 失败就 fallback 到现有 heuristic（保持鲁棒性）

2. 把 `taskPrompt` 升级为 `Task Envelope v1`（仍保持紧凑）：
   - 必留：`agent/from/to/intent/supervisor_reason/facts`
   - 新增最小字段：`goal`（一句话任务目标）、`selected_tool`（本次期望动作）
   - 不加 history、不加大段上下文

3. 明确“未来 LLM 子 agent 的预留合同”（只写规范，不立即实现）：
   - 每个 agent 一段固定 role prompt
   - 每个 agent 显式 allowed tools
   - 输出必须是结构化 action/result，不允许自由改 journey

## 4.3 Guardrail（最小必须）

1. Supervisor 输出 schema 校验 + 字段白名单（已部分具备，继续固化）。
2. 子 agent 工具 allowlist（已具备，继续保持）。
3. Orchestrator 前置条件硬门槛（已具备，保持权威）。
4. 所有失败统一降级 `STAY + status.query fallback`（已具备）。

## 4.4 Observability（与 prompt 直接相关）

建议在现有 node event 基础上，加两类轻量字段（token 成本极低）：

1. `supervisor_prompt_version`、`task_prompt_version`
2. `supervisor_input_hash`、`task_prompt_hash`（用于排查“同输入不同输出”）

这样在 debug 时可以快速回答：是模型漂移、输入变了、还是规则变了。

---

## 5. 落地顺序（建议）

1. 先写文档 contract（spec 补一节 prompt contract）。  
2. 再补 Supervisor gateway 的 parse/validate/fallback（不影响现有主流程）。  
3. 最后把 `taskPrompt` 从 debug 标签升级成 `Task Envelope v1`。  

这三步做完，你们的架构仍然是最小可用，但 prompt 与执行边界会明显更稳，也更方便后续把某些子 agent 渐进式 LLM 化。

