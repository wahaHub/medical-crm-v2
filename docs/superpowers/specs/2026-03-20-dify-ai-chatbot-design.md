# Dify AI 客服与咨询转化入口设计

**Date:** 2026-03-20
**Status:** Draft
**Author:** Claude (revised by Codex)

---

## 1. Overview

将 Dify 作为 Medora CRM v2 的 AI 客服与咨询转化入口。Dify 负责对话编排、RAG、分类与分流；CRM 负责会话安全、内容同步、转化动作、人工升级与审计。

这版设计的核心目标不是“纯 FAQ 机器人”，而是：

- 先尽量回答 FAQ / Package / 流程类问题
- 当用户表达咨询、治疗意向、预约意向时，自动分流到下一步转化动作
- 当用户触发紧急/危机语义时，走固定安全分支，不让模型自由发挥

### 1.1 Goals

- 基于 FAQ / Package / 公共资料做自动问答
- 支持咨询转化分流：留资、建 case、预约咨询、转人工
- 支持有限引用来源，提升可解释性
- 只基于知识库回答；查不到则明确说不知道或转人工
- 不改 Dify 源码，尽量使用原生 workflow 能力

### 1.2 Non-Goals

- 不替代现有人工 `conversations/messages`
- 不做医疗诊断或治疗建议
- 不把匿名 AI 聊天直接并入人工消息收件箱
- 不在 v1 做复杂的多租户权限型自研检索引擎

---

## 2. Architecture

```text
患者端网站
  -> POST /api/v2/chatbot/chat
  -> GET  /api/v2/chatbot/history/:sessionId
  -> POST /api/v2/chatbot/escalate
  -> POST /api/v2/chatbot/convert
  -> POST /api/v2/chatbot/uploads/init

CRM v2 API
  - Optional patient session detection
  - AI chat session ownership control
  - Dify proxy
  - Dify knowledge sync
  - Conversion actions (lead / case / ticket)

Dify (unmodified)
  - Chatflow / Workflow
  - FAQ datasets
  - Package datasets
  - Intent router
  - Crisis / safety branch

CRM DB
  - ai_chat_sessions
  - ai_chat_messages
  - dify_document_mappings
  - ai_sync_outbox
  - support_tickets
```

### 2.1 Responsibility Split

**Dify**

- workflow orchestration
- knowledge retrieval
- risk classification
- intent routing
- answer generation

**CRM**

- 不信任前端会话标识
- session ownership / history access control
- FAQ / package -> Dify dataset sync
- conversion actions
- support ticket creation
- analytics / audit

### 2.2 Dify Source Code Policy

本方案默认：

- 部署原版 self-hosted Dify
- 不 fork / patch Dify core
- 不改 Dify 检索源码
- 仅通过 Dify UI / API / dataset / workflow 配置实现

---

## 3. Product Flow

### 3.1 Main User Paths

1. **FAQ path**
   - 用户问地址、营业时间、流程、套餐
   - Dify 检索知识库并回答
   - 可选展示引用来源

2. **Consultation path**
   - 用户表达治疗/咨询/预约/报价意图
   - Dify 不仅回答，还输出 `next_action`
   - 前端弹出留资 / 建 case / 预约入口

3. **Unknown path**
   - 知识库缺失
   - 明确说不知道
   - 同时引导转人工或咨询入口

4. **Safety path**
   - 出现危机/紧急/高风险语义
   - 直接走固定模板
   - 不走 RAG，不给“项目推荐”

### 3.2 Dify Workflow

```text
User Input
  -> Risk Classification
  -> Intent Router
      -> SAFETY
      -> FAQ_RAG
      -> CONSULT_CONVERSION
      -> UNKNOWN_ESCALATE
```

### 3.3 Structured Output Contract

建议最终节点输出结构化 JSON，由 CRM 解析：

```json
{
  "answer": "string",
  "intent": "FAQ | CONSULT | UNKNOWN | SAFETY",
  "riskLevel": "NORMAL | SENSITIVE | CRISIS",
  "canAnswer": true,
  "nextAction": "ANSWER | CONSULT_CONVERSION | CREATE_CASE | REQUEST_DOCS | ESCALATE | SAFETY",
  "escalationReason": null,
  "collectedFields": {
    "name": "string | null",
    "email": "string | null",
    "country": "string | null",
    "conditionSummary": "string | null",
    "budget": "string | null",
    "intent": "string | null",
    "symptomsSummary": "string | null"
  },
  "missingItems": [
    "passport copy",
    "medical report"
  ],
  "recommendedProviders": [
    {
      "id": "provider-1",
      "name": "Medora Partner Hospital",
      "reason": "Suitable for cosmetic consultation",
      "ctaUrl": "https://..."
    }
  ],
  "citations": [
    {
      "sourceTitle": "General FAQ",
      "snippet": "We are open from ...",
      "sourceType": "FAQ"
    }
  ]
}
```

### 3.4 Why `canAnswer` Alone Is Not Enough

如果目标是咨询转化，只有 `canAnswer=false` 不够。还需要：

- `intent`
- `riskLevel`
- `nextAction`

否则只能做“能答 / 不能答”，不能做“引导进入下一步业务动作”。

### 3.5 Enhanced Conversion Contract

为了把 chatbot 做成更强的咨询转化入口，建议在不改整体架构的前提下补充这几个可选字段：

- `collectedFields`
  - 表示当前轮已经从用户处拿到的 lead / case 关键信息
- `missingItems`
  - 用于 `REQUEST_DOCS`，直接驱动“还缺什么资料”
- `recommendedProviders`
  - 用于后续接 provider DB 或合作医院推荐

这些字段在 MVP 不要求单独建列，可先落到 `ai_chat_messages.metadata` 中，由前端和 CRM use case 按需消费。
其中 `collectedFields` 第一版重点承载：

- `name`
- `email`
- `country`
- `conditionSummary`
- `budget`

### 3.6 Field Priority Rules

为避免 workflow 输出出现互相矛盾的字段，约定以下优先级：

- `riskLevel` 优先于 `nextAction` 与 `intent`
- `nextAction` 优先于 `intent`
- `intent` 仅表示分类标签；前端与 CRM 的执行动作以 `nextAction` 为准

具体规则：

- 如果 `riskLevel = CRISIS`，则必须输出 `nextAction = SAFETY`
- `CRISIS` 场景下不允许走 `CREATE_CASE`、`REQUEST_DOCS` 或 `recommendedProviders`
- 如果 `riskLevel = SENSITIVE`，可以走 `CONSULT_CONVERSION` 或 `ESCALATE`
- `SENSITIVE` 场景下不应做“强推荐”，`recommendedProviders` 仅可作为弱提示，默认可省略

### 3.7 `CONSULT_CONVERSION` vs `CREATE_CASE`

这两个动作都属于转化，但层级不同：

- `CONSULT_CONVERSION`
  - 轻转化入口
  - 在同一个聊天弹窗中展示嵌入式信息收集 widget
  - 先留资、选择意向、预约咨询，必要时补基础信息
- `CREATE_CASE`
  - 重转化入口
  - 仍在同一个聊天弹窗中完成
  - 直接进入更完整的 case 创建字段收集流程

前端应根据该区别决定在同一个聊天弹窗里展示轻量信息收集 widget，还是展示更完整的 case 收集 widget；后端也据此决定调用哪条业务路径。

默认策略：

- 大多数转化场景先走 `CONSULT_CONVERSION`
- 只有当用户明确表达“开始 / 建档 / 匹配医院 / 正式推进”时，才切到 `CREATE_CASE`

这样可以降低 AI 过早触发正式 case 创建的概率，让转化流程更稳。

### 3.8 V1 Decisions

当前已确认的 v1 决策：

- `REQUEST_DOCS` 不只是展示资料清单，还要支持直接上传资料
- `REQUEST_DOCS` 上传走 `POST /api/v2/chatbot/uploads/init`
  - 底层复用现有 upload infrastructure
  - 不直接复用 case document 或 conversation attachment 业务路由
- 大多数转化默认先走 `CONSULT_CONVERSION`
- 只有用户明确表达“开始 / 建档 / 匹配医院 / 正式推进”时，才走 `CREATE_CASE`
- `convert` / `escalate` 的必填字段统一为：
  - `name`
  - `email`
  - `country`
  - `conditionSummary`
  - `budget`
- `recommendedProviders` 第一版不做真实推荐逻辑
  - 字段可以保留在 contract 中
  - workflow 默认不输出
  - 前端默认不展示
- public chatbot 第一版只按 `hospitalType` 拆 dataset
  - 不做单医院 dataset

---

## 4. Session & Security Model

### 4.1 Do Not Trust Frontend `difyConversationId`

前端 **不应** 在 `POST /chatbot/chat` 中传入 `difyConversationId`。

原因：

- 可被伪造，导致串聊
- 会使登录用户与匿名用户的会话绑定变复杂
- 会让后续 history / escalation 的归属校验困难

### 4.2 Correct Session Flow

1. 前端只生成并持久化 `sessionId`
2. 首次对话时，CRM 创建 `ai_chat_session`
3. CRM 调 Dify，获得真正的 `dify_conversation_id`
4. CRM 自己保存该 ID
5. 后续请求 CRM 仅通过 `sessionId` 找到会话
6. 即使前端传了 `difyConversationId`，后端也忽略

### 4.3 History Access Control

仅用 `sessionId` 访问 history 不够稳。

建议：

- 首次 chat 时，后端生成 `session_secret`
- 数据库存 `session_secret_hash`
- 浏览器通过 `httpOnly` cookie 保存短期 session secret
- history / escalate / convert 必须同时满足：
  - `sessionId` 匹配
  - `session_secret` 匹配
  - 若已登录患者，则额外校验 `patient_id`

### 4.4 Abuse Protection

- `POST /chatbot/chat` 按 IP + session 双限流
- max message length: 2000
- history 额外做更严格 rate limit
- escalate / convert 做 contact info validation

---

## 5. Knowledge Base Scope Strategy

### 5.1 Problem

不能只把 `hospitalType / hospitalId` 写进 markdown 文本，然后指望检索自然命中正确 scope。

否则：

- 同类问题可能召回错误医院内容
- 多医院后极易串知识
- 客户会直接感知回答不准

### 5.2 Recommended MVP Strategy

**MVP 用 dataset 分隔 scope，而不是只靠文本分隔。**

建议：

- FAQ dataset 按 `hospitalType` 至少拆成两套
  - `COSMETIC`
  - `REGULAR`
- Package dataset 同样按 `hospitalType` 拆分

如果后续某家医院有独立品牌页或独立 public chatbot：

- 为该医院单独创建 dataset
- 只同步该医院自己的 FAQ / Package

### 5.3 MVP Content Policy

MVP public chatbot 只接入：

- 全局 public FAQ
- 当前站点 public package
- 公共机构信息 / 流程信息

不建议在 MVP 把 `hospital_id` scoped 私有 FAQ 直接混入同一个 public dataset。

### 5.4 Dataset Mapping

配置方式建议改为按 scope 配：

```bash
DIFY_FAQ_DATASET_ID_COSMETIC=...
DIFY_FAQ_DATASET_ID_REGULAR=...
DIFY_PACKAGE_DATASET_ID_COSMETIC=...
DIFY_PACKAGE_DATASET_ID_REGULAR=...
```

如果后续进入 per-hospital public chatbot，再加 dataset registry。

### 5.5 FAQ Document Identity

仍保留 CRM 侧 `entity_key`，用于同步映射和幂等：

```text
faq:{scopeType}:{scopeId}:{categoryName}
```

例子：

```text
faq:hospital_type:COSMETIC:General
faq:hospital:9c8e...:Recovery
```

### 5.6 Citations

引用来源只在 `FAQ_RAG` 分支开启。

建议 citation payload 至少包含：

- `sourceTitle`
- `snippet`
- `sourceType`
- `documentId` 或内部 source key

不要求所有回答都带引用，但 FAQ / 政策 / 流程类回答应支持开启。

---

## 6. Dify Workflow Design

### 6.1 Risk Classification Node

第一节点先做风险分类：

- `NORMAL`
- `SENSITIVE`
- `CRISIS`

### 6.2 Safety Branch

当 `riskLevel = CRISIS`：

- 不走知识库检索
- 不做项目推荐
- 输出固定安全话术
- `nextAction = SAFETY`
- 必要时同时建议转人工

### 6.3 Intent Router

建议 intent 至少分四类：

- `FAQ`
- `CONSULT`
- `UNKNOWN`
- `SAFETY`

### 6.4 FAQ RAG Branch

- 调 Knowledge Retrieval
- 配置 top-k / score threshold / rerank
- 只基于召回内容回答
- 输出 citation
- 如果召回不足，则降级成 `UNKNOWN`

### 6.5 Consultation Conversion Branch

这条是本方案的产品重点。

当用户表达：

- 想咨询
- 想治疗
- 想预约
- 想了解适合的项目
- 想让医院联系我

则不应只返回 FAQ 文案，而应输出：

```json
{
  "intent": "CONSULT",
  "nextAction": "CONSULT_CONVERSION",
  "collectedFields": {
    "intent": "consultation"
  }
}
```

后续由前端或 CRM 引导：

- 留联系方式
- 选择项目方向
- 填症状/诉求摘要
- 调用已有 case-first 业务逻辑与字段模型

默认情况下，这个分支优先输出 `CONSULT_CONVERSION`，而不是 `CREATE_CASE`。

只有在用户明确表达以下信号时，才允许升级到 `CREATE_CASE`：

- “帮我开始”
- “帮我建档”
- “现在就匹配医院”
- “我准备正式推进”

### 6.6 Unknown Branch

当确实缺知识时：

- 明确说不知道
- 不编造
- 给出下一步：
  - `REQUEST_DOCS`
  - `ESCALATE`
  - 或 `CONSULT_CONVERSION`

---

## 7. CRM Backend Changes

### 7.1 Public Endpoints

#### `POST /api/v2/chatbot/chat`

请求体：

```json
{
  "message": "string",
  "sessionId": "string",
  "hospitalType": "COSMETIC | REGULAR"
}
```

后端逻辑：

1. 校验 `sessionId`
2. 忽略任何前端传来的 `difyConversationId`
3. 查找或创建 `ai_chat_session`
4. 调 Dify `/chat-messages`
5. 持久化用户消息与 AI 输出
6. 返回 SSE

#### `GET /api/v2/chatbot/history/{sessionId}`

要求：

- `sessionId` 匹配
- `session_secret` cookie 匹配
- 若已登录患者，校验 `patient_id`

#### `POST /api/v2/chatbot/escalate`

用于人工升级：

- 基于现有 transcript 生成摘要
- 创建 `support_ticket(type = AI_ESCALATION)`
- 更新会话状态
- 请求体中必须收齐：
  - `name`
  - `email`
  - `country`
  - `conditionSummary`
  - `budget`

#### `POST /api/v2/chatbot/convert`

用于咨询转化动作：

- 留资
- 建 case
- 预约咨询
- 请求体中必须收齐：
  - `name`
  - `email`
  - `country`
  - `conditionSummary`
  - `budget`

这条接口复用现有 case-first 业务逻辑与字段定义，但交互承载在同一个聊天弹窗里，不新增独立页面或独立 modal。

#### `POST /api/v2/chatbot/uploads/init`

用于 `REQUEST_DOCS` 场景初始化附件上传。

设计原则：

- 底层复用现有 presigned upload / storage / upload policy infrastructure
- 不直接复用：
  - `POST /api/v2/conversations/{id}/attachments/upload`
  - `POST /api/v2/cases/{caseId}/documents`
- chatbot session 在 case 尚未创建时也必须可以上传
- 后续如果用户进入 `CREATE_CASE`，这些文件再关联到正式 case

### 7.2 Database Changes

#### `ai_chat_sessions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| session_id | VARCHAR(255) | frontend session key |
| session_secret_hash | VARCHAR(255) | history ownership guard |
| dify_conversation_id | VARCHAR(255) | Dify conversation id |
| patient_id | UUID nullable | logged-in or converted patient |
| hospital_type | VARCHAR(20) | scope |
| status | VARCHAR(20) | `ACTIVE` / `ESCALATED` / `CLOSED` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

约束：

- `dify_conversation_id` unique
- `session_id` indexed

#### `ai_chat_messages`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| session_id | UUID | FK |
| role | VARCHAR(20) | `USER` / `ASSISTANT` / `SYSTEM` |
| content | TEXT | |
| intent | VARCHAR(20) nullable | `FAQ` / `CONSULT` / `UNKNOWN` / `SAFETY` |
| risk_level | VARCHAR(20) nullable | `NORMAL` / `SENSITIVE` / `CRISIS` |
| can_answer | BOOLEAN nullable | |
| next_action | VARCHAR(50) nullable | |
| citations | JSONB | source list |
| metadata | JSONB | raw Dify payload + collected fields / missing items / provider recommendations |
| created_at | TIMESTAMPTZ | |

#### `dify_document_mappings`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| entity_type | VARCHAR(50) | `FAQ_CATEGORY` / `PACKAGE_TYPE` |
| entity_key | VARCHAR(255) | scoped key |
| dify_dataset_id | VARCHAR(255) | |
| dify_document_id | VARCHAR(255) | |
| last_synced_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

#### `ai_sync_outbox`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| entity_type | VARCHAR(50) | |
| entity_key | VARCHAR(255) | |
| action | VARCHAR(20) | `UPSERT` / `DELETE` |
| attempts | INT | retry count |
| next_retry_at | TIMESTAMPTZ | |
| status | VARCHAR(20) | `PENDING` / `PROCESSING` / `DONE` / `FAILED` |
| payload | JSONB | |
| created_at | TIMESTAMPTZ | |

### 7.3 Enum Changes

- `TicketType` 新增 `AI_ESCALATION`

---

## 8. Sync Strategy

### 8.1 Why Async Fire-and-Forget Is Not Enough

只写“失败不阻塞 CRUD”还不够，因为会遇到：

- Dify 短时不可用
- 高频 FAQ / package 更新
- 重复同步风暴

### 8.2 Recommended Strategy

FAQ / package CRUD 时：

1. 只写 `ai_sync_outbox`
2. 后台 worker 消费 outbox
3. 按 `entity_key` 合并重复任务
4. 按 `next_retry_at` 重试
5. 保留 admin `fullSync`

---

## 9. Frontend: Chat Widget

### 9.1 Props

```ts
type DifyChatWidgetProps = {
  apiBaseUrl: string;
  hospitalType: 'COSMETIC' | 'REGULAR';
  locale?: string;
  theme?: Record<string, unknown>;
};
```

### 9.2 Client Storage

- `sessionId` 存 `localStorage`
- 不把 `difyConversationId` 作为请求输入源
- `session_secret` 由后端放在 `httpOnly` cookie

### 9.3 UI Behavior for Conversion

当 `nextAction` 为：

- `ANSWER` -> 正常展示回答
- `CONSULT_CONVERSION` -> 在聊天弹窗内显示轻量信息收集 widget
- `CREATE_CASE` -> 在聊天弹窗内切换到更完整的 case 收集 widget
- `REQUEST_DOCS` -> 展示资料清单，并支持直接上传资料
- `ESCALATE` -> 在聊天弹窗内显示人工升级 widget
- `SAFETY` -> 展示固定安全提示

---

## 10. Deployment

### 10.1 Dify

- 部署原版 self-hosted Dify
- 配置模型 provider
- 为 `COSMETIC` / `REGULAR` 建独立 dataset
- 搭建 workflow：risk -> intent -> branch

### 10.2 CRM Env

```bash
DIFY_API_BASE_URL=https://ai.medora.com/v1
DIFY_API_KEY=app-xxxx
DIFY_FAQ_DATASET_ID_COSMETIC=...
DIFY_FAQ_DATASET_ID_REGULAR=...
DIFY_PACKAGE_DATASET_ID_COSMETIC=...
DIFY_PACKAGE_DATASET_ID_REGULAR=...
```

### 10.3 Init Sequence

1. 部署 Dify
2. 配置模型与 workflow
3. 创建 dataset
4. CRM 配置 env
5. 跑 `fullSync`
6. 联调 FAQ / consult / safety / unknown 四条路径

---

## 11. Open Questions

1. 聊天弹窗内的轻量 widget 与完整 case widget，字段上如何和 2026-03-17 patient dashboard 方案保持一致。
