# Dify AI 客服集成设计

**Date:** 2026-03-20
**Status:** Draft
**Author:** Claude (brainstorming session)

---

## 1. Overview

将 Dify (self-hosted) 作为 AI 客服引擎集成到 CRM v2，利用现有 FAQ 和 Package 数据构建 RAG 知识库，为患者提供多语言自动问答服务。当 AI 无法回答时自动转人工并创建 Support Ticket。

### 1.1 Goals

- 基于 CRM 已有的 FAQ 和 Package 数据，通过 RAG 自动回答患者问题
- 支持多语言（依赖 LLM 自身能力，自动检测用户语言并用同语言回复）
- 超出知识库范围时转人工 + 自动创建 Support Ticket
- 所有 AI 对话记录同步到 CRM（无论是否转人工）
- 遵守医疗边界规则（不诊断、不保证疗效、紧急情况提示就医）

### 1.2 Non-Goals

- 不替代现有的 Conversations/Messages 人工消息系统
- 不做医疗诊断或治疗建议
- 不处理支付/订单流程（仅展示 Package 信息）

---

## 2. Architecture

```
┌─────────────────────────────────────┐
│  患者端网站                          │
│  (medora-health-beauty)             │
│  (china-medical-journeys)           │
│         │                           │
│   DifyChatWidget (共享组件)          │
└─────────┬───────────────────────────┘
          │ POST /api/v2/chatbot/chat
          ▼
┌─────────────────────────────────────┐
│  CRM v2 API (Hono) — 代理层        │
│  - /chatbot/chat (streaming proxy)  │
│  - /chatbot/escalate (转人工)       │
│  - /chatbot/history (历史记录)      │
│  - DifySyncService (知识库同步)      │
└─────────┬──────────┬────────────────┘
          │          │
     Dify API    DB (Drizzle)
          │          │
          ▼          ▼
┌──────────────┐  ┌──────────────────┐
│ Dify (VPS)   │  │ CRM Database     │
│ - Chatflow   │  │ - conversations  │
│ - FAQ Dataset│  │ - messages       │
│ - Pkg Dataset│  │ - support_tickets│
│ - GPT-4o     │  │ - dify_*_mappings│
└──────────────┘  └──────────────────┘
```

### 2.1 System Responsibilities

| System | Responsibility |
|--------|---------------|
| **患者端网站** | 展示 DifyChatWidget，调用 CRM API |
| **CRM v2 API** | 代理层：转发 Dify API、同步消息到 DB、创建 Ticket、知识库同步 |
| **Dify** | AI 对话引擎：RAG 检索、LLM 生成、对话管理 |
| **CRM Database** | 持久化所有对话记录、映射关系 |

### 2.2 Why CRM Proxy Layer (Not Direct Frontend → Dify)

- **安全** — Dify API Key 不暴露在前端
- **消息同步** — CRM 侧统一处理，不依赖 Dify Webhook 可靠性
- **用户关联** — CRM 侧将消息与 Patient/Case 关联
- **统一入口** — 两个前端项目调同一个 CRM API

---

## 3. Dify Chatflow Design

```
┌──────────────┐
│  用户输入     │
└──────┬───────┘
       ▼
┌──────────────────┐
│  语言检测         │  LLM 自动识别，设置回复语言
└──────┬───────────┘
       ▼
┌──────────────────┐
│  Knowledge        │  检索 FAQ + Package 知识库
│  Retrieval (RAG)  │  top-k 相关文档
└──────┬───────────┘
       ▼
┌──────────────────┐
│  LLM 节点         │
│  (GPT-4o)        │
│                  │
│  System Prompt:  │
│  - 用检索到的知识回答
│  - 用用户语言回复
│  - 医疗边界规则：
│    · 不诊断、不保证疗效
│    · 紧急情况提示就医
│    · 不替代医生建议
│  - 可回答通识信息
│    （地址、流程、营业时间）
│  - 可推荐相关 Package
│  - 判断是否能回答
│    → 输出 can_answer: bool
└──────┬───────────┘
       ▼
┌──────────────────┐
│  条件分支         │  can_answer?
├──── YES ─────────┼──→ 返回 AI 回复
│                  │
└──── NO ──────────┘
       ▼
┌──────────────────┐
│  转人工流程       │
│  - 告知用户正在转接
│  - 收集联系方式    │
│    (匿名用户)
│  - 触发 CRM API  │
│    → 创建 Ticket  │
└──────────────────┘
```

### 3.1 Knowledge Base (Datasets)

**两个 Dataset：**

1. **FAQ Dataset** — 按 category 聚合，每个 category 一个文档
2. **Package Dataset** — 按 type 聚合，每个 type 一个文档

### 3.2 Medical Boundary Rules (System Prompt)

```
你是 Medora Health & Beauty 的 AI 客服助手。

规则：
1. 只基于知识库内容回答问题
2. 可以回答通识信息（医院地址、营业时间、就医流程、套餐介绍等）
3. 可以推荐相关套餐（Package）
4. 严禁提供医疗诊断或治疗建议
5. 严禁保证治疗效果
6. 遇到紧急医疗情况，立即提示用户就医或拨打急救电话
7. 所有医疗相关问题都应建议用户咨询专业医生
8. 用用户的语言回复
9. 如果无法回答用户的问题，设置 can_answer = false，礼貌告知将转接人工客服
```

---

## 4. Knowledge Base Sync Strategy

### 4.1 FAQ Document Format (Per Category)

```markdown
# [Category Name]

Hospital Type: COSMETIC / REGULAR

---

## Q: [Question 1]
**A:** [Answer 1]
**Keywords:** keyword1, keyword2

---

## Q: [Question 2]
**A:** [Answer 2]
**Keywords:** keyword3, keyword4
```

### 4.2 Package Document Format (Per Type)

```markdown
# [Package Type] Packages

---

## [Package Name (EN)] / [Package Name (ZH)]

**Price:** $XXX USD
**Status:** PUBLISHED

### Description
[descriptionEn]
[descriptionZh]

### What's Included
- inclusion 1
- inclusion 2
```

### 4.3 Sync Triggers

| CRM Use Case | Sync Action |
|--------------|-------------|
| CreateFaqItem | Regenerate that category's document → upsert to Dify |
| UpdateFaqItem | Regenerate that category's document → upsert to Dify |
| DeleteFaqItem | Regenerate that category's document → upsert to Dify |
| CreateFaqCategory | Create new empty document in Dify |
| DeleteFaqCategory | Delete document from Dify |
| CreatePackage | Regenerate that type's document → upsert to Dify |
| UpdatePackage | Regenerate that type's document → upsert to Dify |
| PublishPackage | Regenerate that type's document → upsert to Dify |
| UnpublishPackage | Regenerate that type's document → upsert to Dify |
| DeletePackage | Regenerate that type's document → upsert to Dify |

### 4.4 DifySyncService

```typescript
interface DifySyncService {
  // FAQ sync (by category name + hospitalType, since chatbot_faq_items.category is a VARCHAR name, not a FK)
  syncFaqCategory(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void>;
  deleteFaqCategoryDocument(categoryName: string, hospitalType: 'COSMETIC' | 'REGULAR'): Promise<void>;

  // Package sync (by type)
  syncPackageType(type: PackageType): Promise<void>;

  // Full sync (initial deployment / data repair)
  fullSync(): Promise<void>;
}
```

**Note:** `chatbot_faq_items.category` is a VARCHAR string (category name), not a FK to `chatbot_faq_categories.id`. The sync key is `(categoryName, hospitalType)`.

**Logic:**
1. Query all active FAQs/Packages for that category name + hospitalType / package type
2. Convert to Markdown document
3. Check `dify_document_mappings` for existing Dify document ID
4. Existing → `PUT` update document in Dify
5. New → `POST` create document in Dify, save mapping

### 4.5 Fault Tolerance

- Sync failure **does not block** FAQ/Package CRUD (async fire-and-forget + error logging)
- `dify_document_mappings.lastSyncedAt` for audit
- `fullSync()` endpoint for Admin to manually trigger full rebuild

---

## 5. CRM Backend Changes

### 5.1 New API Endpoints

#### `POST /api/v2/chatbot/chat`

Streaming proxy to Dify Chat API.

**Request:**
```json
{
  "message": "string",
  "difyConversationId": "string | null",
  "userId": "string | null",
  "sessionId": "string (for anonymous users)",
  "hospitalType": "COSMETIC | REGULAR"
}
```

**Response:** Server-Sent Events (streaming)

**Logic:**
1. Forward message to Dify Chat API (streaming mode)
2. On first message: create Conversation (category: `AI_CHATBOT`) + `dify_conversation_mappings`
3. Save user message + AI response to Messages table
4. Return streaming response to frontend

#### `POST /api/v2/chatbot/escalate`

Transfer to human agent + create Ticket.

**Request:**
```json
{
  "difyConversationId": "string",
  "reason": "string",
  "contactInfo": {
    "name": "string",
    "email": "string",
    "phone": "string (optional)"
  }
}
```

**Logic:**
1. Find Conversation via `dify_conversation_mappings`
2. Create SupportTicket:
   - `type`: `AI_ESCALATION`
   - `priority`: `MEDIUM`
   - `subject`: "AI 客服转人工 - [问题摘要]"
   - `description`: AI 对话摘要 + 转人工原因
3. Update mapping status → `ESCALATED`

#### `GET /api/v2/chatbot/history/{difyConversationId}`

Retrieve chat history for page refresh / context restore. Uses `difyConversationId` (from SSE response) as the lookup key.

**Response:**
```json
{
  "difyConversationId": "string",
  "messages": [
    {
      "role": "user | assistant",
      "content": "string",
      "createdAt": "ISO timestamp"
    }
  ]
}
```

### 5.2 New Database Tables

#### `dify_conversation_mappings`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| dify_conversation_id | VARCHAR(255) | Dify conversation ID (UNIQUE) |
| conversation_id | UUID | FK → conversations.id |
| user_id | UUID (nullable) | FK → users.id (logged-in user) |
| session_id | VARCHAR(255) (nullable) | Anonymous user session |
| status | ENUM | `ACTIVE`, `ESCALATED`, `CLOSED` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `dify_document_mappings`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| entity_type | VARCHAR(50) | `FAQ_CATEGORY` or `PACKAGE_TYPE` |
| entity_id | VARCHAR(255) | Category ID or Package Type string |
| dify_dataset_id | VARCHAR(255) | Dify Dataset ID |
| dify_document_id | VARCHAR(255) | Dify Document ID |
| last_synced_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### 5.3 Enum Changes

- `TicketType` 新增: `AI_ESCALATION`
- `Conversation.category` 新增: `AI_CHATBOT`

### 5.4 New Service

```
DifySyncService (infrastructure layer)
├── Implements IDifySyncService (domain port)
├── Uses Dify Dataset API (HTTP client)
├── Injected into FAQ/Package use cases
└── Configuration via env vars:
    - DIFY_API_BASE_URL
    - DIFY_API_KEY
    - DIFY_FAQ_DATASET_ID
    - DIFY_PACKAGE_DATASET_ID
```

---

## 6. Frontend: DifyChatWidget

Shared React component embedded in both patient-facing projects.

### 6.1 Component Structure

```
DifyChatWidget
├── ChatBubble          — 浮动按钮 (右下角)
├── ChatWindow
│   ├── MessageList     — 消息列表 (支持 streaming 显示)
│   ├── MessageInput    — 输入框
│   └── EscalationForm  — 转人工时收集联系信息
└── Props:
    ├── apiBaseUrl: string     — CRM API 地址
    ├── hospitalType: string   — 'COSMETIC' | 'REGULAR'
    ├── userId?: string        — 已登录用户 ID
    ├── theme?: object         — 样式定制
    └── locale?: string        — 默认语言
```

### 6.2 Chat Flow

```
用户打开 Widget
    │
    ├── 已登录 → 自动携带 userId + 语言偏好
    └── 匿名 → 生成临时 sessionId (localStorage)
    │
    ▼
用户发消息 → POST /api/v2/chatbot/chat (streaming)
    │
    ▼
前端逐字展示 AI 回复
    │
    ├── AI 正常回答 → 继续对话
    └── AI 转人工 → 显示 EscalationForm → POST /api/v2/chatbot/escalate
```

### 6.3 Sharing Strategy

共享组件作为 Turborepo 内部 package `packages/chat-widget`，与现有 monorepo 结构一致。两个患者端项目通过 npm dependency 引用（`"@medora/chat-widget": "workspace:*"`）。

---

## 7. Deployment

### 7.1 Dify VPS

- **Provider:** Hetzner (推荐) 或 DigitalOcean
- **Spec:** 2 Core CPU, 4 GiB RAM
- **Cost:** ~€7-24/mo
- **Stack:** Docker Compose (official Dify)
- **Domain:** e.g. `ai.medora.com`
- **SSL:** Let's Encrypt (certbot)

### 7.2 Docker Compose Services

- dify-api
- dify-worker
- dify-web (管理后台)
- postgres (Dify internal)
- redis
- weaviate (向量数据库)
- nginx (反向代理 + SSL)

### 7.3 CRM v2 Environment Variables

```
DIFY_API_BASE_URL=https://ai.medora.com/v1
DIFY_API_KEY=app-xxxx
DIFY_FAQ_DATASET_ID=xxxx
DIFY_PACKAGE_DATASET_ID=xxxx
```

### 7.4 Init Sequence

1. VPS 部署 Dify Docker Compose
2. Dify 后台配置 LLM Provider (OpenAI GPT-4o)
3. 创建 2 个 Dataset (FAQ / Package)
4. 创建 Chatflow (按 Section 3 设计)
5. CRM 配置环境变量
6. CRM 运行 `fullSync()` 导入所有 FAQ + Package
7. 测试端到端对话
8. 两个前端项目接入 DifyChatWidget

---

## 8. Monitoring & Operations

- **Dify 自带**: 对话日志、用量统计、模型调用监控
- **CRM 侧**: `dify_document_mappings.lastSyncedAt` 监控同步状态
- **同步失败**: 记录日志 + 告警通知
- **Admin 操作**: `fullSync()` 端点供手动触发全量重建
- **成本监控**: OpenAI API 用量 (GPT-4o per-token billing)

---

## 9. Edge Cases & Security

### 9.1 Anonymous Users & Message Storage

**Problem:** `messages.sender_id` and `support_tickets.patient_id` are NOT NULL FK to `users`.

**Solution:**
- Create a well-known **system bot user** record (e.g., UUID `00000000-0000-0000-0000-000000000001`, role `SYSTEM`) for AI-generated messages
- Anonymous users: on first message, create a **guest user** record using `sessionId` as identifier. If escalation happens, the `EscalationForm` collects contact info to update the guest user record
- This avoids schema changes to existing NOT NULL constraints

### 9.2 Rate Limiting & Abuse Prevention

`/chatbot/chat` is a public endpoint proxying to a paid LLM. Required protections:

- **Per-session rate limit:** max 30 messages/minute
- **Per-IP rate limit:** max 60 messages/minute
- **Max message length:** 2000 characters
- **Max conversation length:** 100 messages (after which suggest escalation)
- Implement via Hono middleware (consistent with existing rate limiting patterns)

### 9.3 Authentication Strategy

- `POST /api/v2/chatbot/chat` — **public** (supports both auth and anon users)
- `GET /api/v2/chatbot/history/{difyConversationId}` — **public** (scoped by difyConversationId or sessionId)
- `POST /api/v2/chatbot/escalate` — **public** (requires contactInfo for anon users)
- `POST /api/v2/chatbot/sync` — **admin-only** (existing auth middleware)

These public endpoints follow the same pattern as `patient-public.routes.ts`.

### 9.4 Streaming Response Format (SSE)

```
event: message
data: {"chunk": "Hello", "difyConversationId": "abc123"}

event: message
data: {"chunk": " how", "difyConversationId": "abc123"}

event: done
data: {"difyConversationId": "abc123", "canAnswer": true, "fullResponse": "Hello how can I help?"}

// Error case:
event: error
data: {"code": "DIFY_UNAVAILABLE", "message": "AI service temporarily unavailable"}
```

- First chunk includes `difyConversationId` — frontend stores it in `localStorage` for session continuity
- `done` event includes `canAnswer` flag — frontend uses this to trigger escalation flow
- Connection timeout: 60 seconds

### 9.5 Multi-Hospital Context

The two patient-facing sites serve different hospital types. The widget passes context:

- `DifyChatWidget` adds a `hospitalType` prop (`COSMETIC` | `REGULAR`)
- `/chatbot/chat` request includes `hospitalType` field
- CRM proxy passes `hospitalType` as a Dify conversation variable
- Dify Chatflow uses this variable to filter which FAQ documents are relevant (metadata filtering in Knowledge Retrieval node)

### 9.6 Package Sync — Only Published

- Only `PUBLISHED` packages are included in Dify documents
- When the last published package of a type is unpublished, the document is regenerated as empty (Dify handles empty documents gracefully)

---

## 10. Database Migrations Required

All migrations in a single file: `XXX_dify_integration.sql`

1. **ALTER TYPE** `conversation_category` ADD VALUE `'AI_CHATBOT'`
2. **ALTER TYPE** `ticket_type` ADD VALUE `'AI_ESCALATION'`
3. **CREATE TABLE** `dify_conversation_mappings` (per Section 5.2, with UNIQUE on both `dify_conversation_id` and `conversation_id`)
4. **CREATE TABLE** `dify_document_mappings` (per Section 5.2)
5. **INSERT** system bot user record (`id: 00000000-0000-0000-0000-000000000001`, role: SYSTEM)

---

## 11. Admin Sync Endpoints (Appendix to Section 5.1)

#### `POST /api/v2/chatbot/sync` (Admin-only)

Trigger full sync of all FAQ + Package documents to Dify.

#### `POST /api/v2/chatbot/sync/faq-categories/{categoryId}` (Admin-only)

Trigger sync of a single FAQ category document.

#### `POST /api/v2/chatbot/sync/package-types/{type}` (Admin-only)

Trigger sync of a single package type document.
