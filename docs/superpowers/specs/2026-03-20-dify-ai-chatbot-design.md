# Dify AI 客服集成设计

**Date:** 2026-03-20
**Status:** Draft
**Author:** Claude (revised by Codex)

---

## 1. Overview

将 Dify (self-hosted) 作为 AI 客服引擎集成到 CRM v2，利用现有 FAQ 与 Package 数据构建 RAG 知识库，为患者提供多语言自动问答服务。AI 无法回答时转人工，并在 CRM 内创建可跟踪的升级记录。

这版设计基于当前代码库的真实约束做了修正：

- 不信任前端传入的 `userId`
- 不把匿名 AI 会话强行塞进现有 `conversations/messages`
- FAQ 同步显式支持 `hospital_id` scope
- Dify 文档同步按当前仓库内 Dify SDK 的实际 API 形状设计

### 1.1 Goals

- 基于 CRM 已有 FAQ 和 Package 数据，通过 RAG 自动回答患者问题
- 支持多语言回复
- 超出知识库范围时转人工
- 所有 AI 对话记录落 CRM，支持回放与审计
- 遵守医疗边界规则

### 1.2 Non-Goals

- 不替代现有人工 `conversations/messages` 系统
- 不做医疗诊断或治疗建议
- 不处理支付/订单流程
- v1 不要求把 AI 聊天直接接入现有人工消息收件箱

---

## 2. Architecture

```text
患者端网站
  -> POST /api/v2/chatbot/chat
  -> GET  /api/v2/chatbot/history/:sessionId
  -> POST /api/v2/chatbot/escalate

CRM v2 API (Hono)
  - Public chatbot proxy
  - Patient session detection (cookie)
  - AI chat session/message persistence
  - Escalation orchestration
  - Dify dataset sync

Dify
  - Chat app
  - FAQ dataset
  - Package dataset

CRM DB
  - ai_chat_sessions
  - ai_chat_messages
  - support_tickets
  - dify_document_mappings
```

### 2.1 Why CRM Proxy Layer

- Dify API key 不暴露到前端
- 统一做鉴权、限流、日志与错误处理
- 可以把登录用户和匿名访客统一映射到 CRM 侧 session
- 两个患者端站点共享同一入口

---

## 3. Chat Flow

### 3.1 Request Flow

1. 前端生成并持久化 `sessionId` 到 `localStorage`
2. 前端调用 `POST /api/v2/chatbot/chat`
3. CRM API 从 `patient_session` cookie 判断是否为已登录患者
4. CRM API 以 streaming 模式调用 Dify `/chat-messages`
5. CRM API 将用户消息和 AI 回复写入 `ai_chat_messages`
6. CRM API 将 SSE 转发给前端
7. 当前端或后端判断需要转人工时，调用 `POST /api/v2/chatbot/escalate`

### 3.2 Authentication Strategy

- 登录用户：后端从 `patient_session` cookie 推导 `patientId`
- 匿名用户：仅依赖 `sessionId`
- `POST /api/v2/chatbot/chat` 请求体不接受 `userId`

### 3.3 Dify Chatflow

```text
用户输入
  -> Knowledge Retrieval (FAQ + Package)
  -> LLM
  -> 输出:
     - answer
     - can_answer
     - escalation_reason (optional)
```

建议在 Dify 中让最终输出带结构化字段，而不是仅靠前端猜测：

```json
{
  "answer": "string",
  "can_answer": true,
  "escalation_reason": null
}
```

### 3.4 Medical Boundary Rules

```text
你是 Medora Health & Beauty 的 AI 客服助手。

规则：
1. 只基于知识库内容回答
2. 可以回答机构信息、流程、营业时间、套餐介绍
3. 可以推荐相关套餐，但不能替代医生判断
4. 不提供诊断、处方、疗效保证
5. 如遇紧急情况，立即建议线下就医或联系急救服务
6. 必须使用用户当前语言回复
7. 若知识库无法支持回答，输出 can_answer = false
```

---

## 4. Knowledge Base Sync Strategy

### 4.1 Dataset Strategy

- **FAQ Dataset**
  - 按分类文档同步
  - 同步粒度必须带 scope：`hospitalType + hospitalId + categoryName`
- **Package Dataset**
  - 按 `Package.type` 聚合同步
  - 仅同步 `PUBLISHED` package

### 4.2 FAQ Document Identity

当前 FAQ 已支持全局分类与医院级分类并存，因此不能只用 `(categoryName, hospitalType)` 做映射键。

建议在 CRM 侧生成稳定 `entity_key`：

```text
faq:{hospitalType}:{hospitalId || "global"}:{categoryName}
```

例如：

```text
faq:COSMETIC:global:General
faq:COSMETIC:1f2e...:General
```

### 4.3 FAQ Document Format

```markdown
# General

Hospital Type: COSMETIC
Hospital Scope: global

---

## Q: ...
**A:** ...
**Keywords:** ...
```

若 `hospitalId` 不为空，建议额外写入：

```markdown
Hospital Scope: hospital
Hospital ID: ...
```

### 4.4 Package Document Format

```markdown
# CONSULTATION Packages

---

## Basic Consult / 基础咨询

**Price:** 100 USD
**Status:** PUBLISHED

### Description
...

### What's Included
- ...
```

### 4.5 Sync Triggers

| CRM Use Case | Sync Action |
|--------------|-------------|
| CreateFaqItem | Regenerate scoped FAQ document |
| UpdateFaqItem | Regenerate scoped FAQ document |
| DeleteFaqItem | Regenerate scoped FAQ document |
| CreateFaqCategory | No immediate sync if category has no item |
| DeleteFaqCategory | Delete mapped document if it exists |
| CreatePackage | Regenerate that package type if package is published |
| UpdatePackage | Regenerate that package type |
| PublishPackage | Regenerate that package type |
| UnpublishPackage | Regenerate that package type |
| DeletePackage | Regenerate that package type |

### 4.6 Dify API Notes

基于当前仓库中的 Dify SDK，文本文档同步应使用：

- `POST /datasets/{datasetId}/document/create_by_text`
- `POST /datasets/{datasetId}/documents/{documentId}/update_by_text`

不使用：

- `PUT` 更新文档
- `create-by-text` / `update-by-text` 这种连字符路径
- 空文本文档

### 4.7 Fault Tolerance

- 同步失败不阻塞 FAQ / Package CRUD
- 记录 `last_synced_at`
- 提供 admin-only `fullSync` 触发器

---

## 5. CRM Backend Changes

### 5.1 New Public Endpoints

#### `POST /api/v2/chatbot/chat`

请求体：

```json
{
  "message": "string",
  "sessionId": "string",
  "difyConversationId": "string | null",
  "hospitalType": "COSMETIC | REGULAR"
}
```

处理逻辑：

1. 从 cookie 解析患者登录态；如果没有则视为匿名会话
2. 校验 `sessionId`、限流、消息长度
3. 调用 Dify `/chat-messages`
4. 将 user/assistant 消息写入 `ai_chat_messages`
5. 返回 SSE

#### `GET /api/v2/chatbot/history/{sessionId}`

返回该 `sessionId` 下最近一段 AI 聊天记录。

访问控制：

- 匿名用户：必须携带同一个 `sessionId`
- 登录用户：后端校验 `patientId` 与 `ai_chat_sessions.patient_id`

#### `POST /api/v2/chatbot/escalate`

请求体：

```json
{
  "sessionId": "string",
  "reason": "string",
  "contactInfo": {
    "name": "string",
    "email": "string",
    "phone": "string | null"
  }
}
```

处理逻辑：

1. 查找 `ai_chat_session`
2. 生成 AI 对话摘要
3. 若当前为匿名访客，按联系信息创建或 upsert 一个最小 `PATIENT` 用户
4. 创建 `support_ticket(type = AI_ESCALATION)`
5. 将 `ai_chat_session.status` 标记为 `ESCALATED`

### 5.2 New Admin Endpoint

#### `POST /api/v2/chatbot/sync`

- admin-only
- 触发 FAQ + Package 全量重建

### 5.3 Database Changes

#### `ai_chat_sessions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| session_id | VARCHAR(255) | 前端匿名/半匿名 session key |
| dify_conversation_id | VARCHAR(255) | Dify conversation id |
| patient_id | UUID nullable | 已登录患者或升级后关联患者 |
| hospital_type | VARCHAR(20) | `COSMETIC` / `REGULAR` |
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
| session_id | UUID | FK -> ai_chat_sessions.id |
| role | VARCHAR(20) | `USER` / `ASSISTANT` / `SYSTEM` |
| content | TEXT | message body |
| can_answer | BOOLEAN nullable | only for assistant terminal message |
| metadata | JSONB | 原始 Dify event、reason 等 |
| created_at | TIMESTAMPTZ | |

#### `dify_document_mappings`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| entity_type | VARCHAR(50) | `FAQ_CATEGORY` / `PACKAGE_TYPE` |
| entity_key | VARCHAR(255) | scoped stable key |
| dify_dataset_id | VARCHAR(255) | |
| dify_document_id | VARCHAR(255) | |
| last_synced_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

唯一约束：

- `(entity_type, entity_key)`

### 5.4 Enum Changes

- `TicketType` 新增 `AI_ESCALATION`

本方案不要求把 AI 聊天接入现有 `ConversationCategory`。

---

## 6. Frontend: Chat Widget

### 6.1 Props

```ts
type DifyChatWidgetProps = {
  apiBaseUrl: string;
  hospitalType: 'COSMETIC' | 'REGULAR';
  locale?: string;
  theme?: Record<string, unknown>;
};
```

不暴露 `userId` prop。

### 6.2 Client Storage

- `sessionId` 存 `localStorage`
- `difyConversationId` 存 `localStorage`
- 登录身份由浏览器自动带 cookie

### 6.3 SSE Contract

```text
event: chunk
data: {"text":"Hello","difyConversationId":"conv-1"}

event: done
data: {"difyConversationId":"conv-1","canAnswer":true}

event: error
data: {"code":"DIFY_UNAVAILABLE","message":"..."}
```

---

## 7. Security & Abuse Prevention

- `POST /api/v2/chatbot/chat` 做 IP + session 双限流
- 最大消息长度 2000
- 服务端自行推导登录用户，不信任 body.userId
- `history` 端点必须校验 `sessionId` 或登录归属
- escalation 必须强校验 contact info

---

## 8. Deployment

### 8.1 Dify

- self-hosted Docker Compose
- 独立域名，如 `ai.medora.com`
- 配置 OpenAI provider
- 建立两个 dataset：FAQ / Package
- 建立 chatbot app

### 8.2 CRM Env Vars

```bash
DIFY_API_BASE_URL=https://ai.medora.com/v1
DIFY_API_KEY=app-xxxx
DIFY_FAQ_DATASET_ID=xxxx
DIFY_PACKAGE_DATASET_ID=xxxx
```

### 8.3 Init Sequence

1. 部署 Dify
2. 配置模型与 app
3. 创建 FAQ / Package dataset
4. CRM 配置 env
5. 运行全量 `fullSync`
6. 联调 SSE、history、escalation

---

## 9. Open Questions

1. 匿名升级时，是否允许没有 email。若不允许，前端升级表单应强制 email。
2. 升级后是否需要自动创建人工 `conversation`，还是先只建 `support_ticket`。
3. FAQ 医院级分类命名是否允许与全局分类重名。若允许，必须坚持 scoped `entity_key`。
