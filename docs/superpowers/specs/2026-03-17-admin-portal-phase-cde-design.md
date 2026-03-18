# Admin Portal Phase C+D+E 设计文档

> 日期：2026-03-17
> 范围：Phase C（Messages 消息中心）+ Phase D（Orders / Packages / Support 独立页面）+ Phase E（Question Collectors / Chatbot FAQ / Settings）
> 前置：Phase A+B 已完成（Dashboard、Cases、Hospitals、Case Detail 10 Tab）

---

## 一、设计决策汇总

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 实施范围 | C + D + E 合并 | 7 个独立页面，模式一致，无互相依赖 |
| 页面模式 | 全局列表页 + 内联详情/编辑 | 与 Case Detail Tab 区别：不限 caseId，支持更丰富筛选 |
| 后端新增 | Settings（3 endpoints）+ Chatbot FAQ（6 endpoints） | 其余领域 API 以现有 v2 端点复用为主 |
| 组件复用 | 大量复用 Case Detail Tab 已有逻辑 | Messages/Orders/Tickets Tab 组件可提取公共部分 |

---

## 二、路由结构扩展

在 `apps/admin/src/app/(portal)/` 下新增：

```
├── messages/
│   └── page.tsx                # Messages 消息中心
├── orders/
│   └── page.tsx                # Orders 订单管理
├── packages/
│   ├── page.tsx                # Packages 套餐列表
│   └── new/page.tsx            # 创建套餐
├── support/
│   └── page.tsx                # Support Tickets 工单列表
├── question-collectors/
│   ├── page.tsx                # 问卷模板列表
│   └── new/page.tsx            # 创建模板
├── chatbot/
│   └── page.tsx                # Chatbot FAQ 管理
└── settings/
    └── page.tsx                # 个人设置
```

## 三、侧边栏扩展

在 `admin-shell.tsx` 的 `NAV_ITEMS` 中新增（现有 Dashboard/Cases/Hospitals 之后）：

| 图标 | 标签 | 路由 | key |
|------|------|------|-----|
| MessageSquare | Messages | `/messages` | messages |
| ShoppingCart | Orders | `/orders` | orders |
| Package | Packages | `/packages` | packages |
| Ticket | Support | `/support` | support |
| ClipboardList | Q&A Templates | `/question-collectors` | question-collectors |
| HelpCircle | Chatbot & FAQ | `/chatbot` | chatbot |
| SettingsIcon | Settings | `/settings` | settings |

更新 `getActiveKey()` 函数以匹配新路由。

---

## 四、页面详细设计

### 4.1 Messages 消息中心 (`/messages`) — Phase C

**数据源**：`GET /api/v2/conversations` + `GET /api/v2/conversations/{id}/messages`

**与 Case Detail Messages Tab 的区别**：
- Tab 版按 `caseId` 过滤 → 独立页面不过滤，显示所有对话
- 独立页面增加更多筛选维度

| 模块 | 内容 |
|------|------|
| **左侧对话列表** | 全部对话（不限 caseId），支持搜索 + 分类筛选。当前会话分类按 patientsflow + v2 实现统一为 3 类：`ADMIN_HOSPITAL` / `ADMIN_PATIENT` / `HOSPITAL_PATIENT` |
| **右侧聊天窗口** | 选中对话后加载消息列表，使用 `ChatLayout`（`@medical-crm/ui`） |
| **消息审核** | 待审核消息高亮，approve/reject 操作 |
| **右侧信息面板** | 显示关联 Case 信息（caseNumber、patientName），可点击跳转 Case Detail |

**复用策略**：从 `case-messages-tab.tsx` 提取核心渲染逻辑。独立页面版本增加：
- 无 caseId 过滤的全局对话列表
- 对话分类标签（conversation category）
- 关联 case 信息面板

**组件**：`ChatLayout`（shared/ui）+ `StatusBadge` + `SearchInput` + `DataTable`

---

### 4.2 Orders 订单管理 (`/orders`) — Phase D

**数据源**：`GET /api/v2/orders` + `GET /api/v2/orders/{id}`

**与 Case Detail Orders Tab 的区别**：
- Tab 版按 `caseId` 过滤 → 独立页面显示所有订单
- 增加更多筛选和统计

| 模块 | 内容 |
|------|------|
| **筛选栏** | 搜索框（订单号）+ 状态筛选（6 个状态）+ 类型筛选（`CONSULTATION` / `HEALTH_CHECKUP` / `SECOND_OPINION` / `VISA_PACKAGE` / `INSURANCE` / `ACCOMMODATION` / `TREATMENT_DEPOSIT` / `TRANSLATION`） |
| **订单表格** | 订单号、患者名（需 BFF 关联）、套餐名（packageId → 需关联）、金额 + 币种、状态 Badge、创建时间 |
| **订单详情** | 点击展开：支付方式、支付时间、退款金额/原因、关联 Case 链接 |

**状态 Badge 样式**（6 个）：

| 状态 | 颜色 |
|------|------|
| PENDING_PAYMENT | amber |
| PAID | blue |
| IN_PROGRESS | indigo |
| COMPLETED | green |
| CANCELLED | gray |
| REFUNDED | red |

**Admin 只读**，无退款按钮（`RequestRefundUseCase` 仅允许 PATIENT）。

---

### 4.3 Packages 套餐管理 (`/packages`) — Phase D

**数据源**：
- `GET /api/v2/packages` — 列表（支持 status + type 过滤）
- `POST /api/v2/packages` — 创建
- `PUT /api/v2/packages/{id}` — 更新
- `GET /api/v2/packages/{id}` — 详情
- `POST /api/v2/packages/{id}/publish` — 发布
- `POST /api/v2/packages/{id}/unpublish` — 下架
- `GET /api/v2/packages/{id}/analytics` — 套餐分析（P1，可后置）

#### 套餐列表页 (`/packages`)

| 模块 | 内容 |
|------|------|
| **筛选栏** | 搜索框 + 类型筛选（`CONSULTATION` / `HEALTH_CHECKUP` / `SECOND_OPINION` / `VISA_PACKAGE` / `INSURANCE` / `ACCOMMODATION` / `TREATMENT_DEPOSIT` / `TRANSLATION`）+ 状态筛选（DRAFT/PUBLISHED）+ "新建套餐" 按钮 |
| **套餐表格** | 名称（nameEn）、类型 Badge、价格（price + currency）、状态 Badge（DRAFT 灰 / PUBLISHED 绿）、创建时间 |
| **行操作** | 编辑（打开编辑 Modal）、发布/下架切换 |

#### 创建/编辑套餐

使用 Modal 或独立页面 `/packages/new`：

| 字段 | 必填 | 类型 | API 字段 |
|------|------|------|---------|
| 英文名称 | ✅ | text | `nameEn` |
| 中文名称 | ❌ | text | `nameZh` |
| 类型 | ✅ | select | `type` (`CONSULTATION` / `HEALTH_CHECKUP` / `SECOND_OPINION` / `VISA_PACKAGE` / `INSURANCE` / `ACCOMMODATION` / `TREATMENT_DEPOSIT` / `TRANSLATION`) |
| 价格 | ✅ | text（decimal string，如 "299.99"） | `price`（后端 schema 为 `z.string().regex()`，非 number） |
| 币种 | ✅ | select | `currency` (USD/CNY/THB) |
| 英文描述 | ❌ | textarea | `descriptionEn` |
| 中文描述 | ❌ | textarea | `descriptionZh` |
| 包含项目 | ❌ | tag input | `inclusions` (string[]) |
| 封面图 URL | ❌ | text | `coverImageUrl` |
| 排序权重 | ❌ | number | `sortWeight` |
| 定时发布 | ❌ | datetime | `publishAt` |
| 定时下架 | ❌ | datetime | `takedownAt` |
| 配置 | ❌ | JSON | `config` |

创建后状态为 DRAFT，需手动发布。

为避免跨端枚举漂移，`PackageType` 与 `OrderType` 使用同一枚举集合（与 patientsflow 的 `DATA_MODELS.md` 对齐）。

---

### 4.4 Support Tickets (`/support`) — Phase D

**数据源**：`GET /api/v2/tickets` + `GET /api/v2/tickets/{id}`

**与 Case Detail Support Tab 的区别**：
- Tab 版按 `caseId` 过滤 → 独立页面显示所有工单
- 增加分配、优先级筛选

| 模块 | 内容 |
|------|------|
| **筛选栏** | 搜索框 + 状态筛选（OPEN/ASSIGNED/IN_PROGRESS/PENDING_INFO/RESOLVED/CLOSED）+ 类型筛选（7 种）+ 优先级筛选（HIGH/MEDIUM/LOW） |
| **工单表格** | 工单号、主题、类型 Badge、优先级 Badge、状态 Badge、创建时间、分配给 |
| **工单详情** | 点击展开：工单信息 + 回复历史 + 回复输入框 + 状态管理按钮（assign/close） |

**复用**：`case-support-tab.tsx` 的 TicketCard + TicketDetailPanel 可提取复用，区别是不按 caseId 过滤。

---

### 4.5 Question Collectors (`/question-collectors`) — Phase E

**数据源**：
- `GET /api/v2/question-templates` — 模板列表
- `POST /api/v2/question-templates` — 创建模板
- `PUT /api/v2/question-templates/{id}` — 更新模板
- `GET /api/v2/question-templates/{id}` — 模板详情
- `PATCH /api/v2/question-templates/{id}/publish` — 发布/下线（P1，可后置）
- `GET /api/v2/questionnaire-responses` — 所有回答列表
- `GET /api/v2/question-templates/{templateId}/customizations` — 获取定制
- `POST /api/v2/question-templates/{templateId}/customizations` — 定制问题

#### 模板列表页 (`/question-collectors`)

| 模块 | 内容 |
|------|------|
| **模板表格** | 模板名、分类、版本号、是否激活（Badge）、创建时间 |
| **操作** | "新建模板" 按钮、行操作：编辑、查看回答 |

#### 创建/编辑模板

| 字段 | 必填 | 类型 | API 字段 |
|------|------|------|---------|
| 模板名称 | ✅ | text | `templateName` |
| 分类 | ✅ | text | `category` |
| 适用手术类型 | ❌ | tag input | `procedureTypes` (string[]) |
| 模板版本 | ✅ | number | `version` |
| 问题列表 | ✅ | 动态表单（支持双语 + 条件跳转） | `questions` (JSON array) |
| 是否激活 | ❌ | toggle | `isActive` |

问题列表每项建议结构（与 patientsflow 对齐）：
- `questionId`
- `questionType`
- `questionTextZh` / `questionTextEn`
- `required`
- `options?`（每项含 `value` + `labelZh` + `labelEn`）
- `conditionalLogic?`（如基于上题答案显示/跳转）

不在 Phase E 强制上线复杂拖拽编辑器，但数据结构必须预留双语与条件逻辑字段，避免二次迁移。

#### 回答列表

通过 `GET /api/v2/questionnaire-responses` 查看所有患者回答，按 case 关联。展示完成状态（NOT_STARTED / IN_PROGRESS / COMPLETED）。

---

### 4.6 Chatbot & FAQ Management (`/chatbot`) — Phase E

**后端需新建**（与 patientsflow `Chatbot & FAQ` 模块一致）。

#### 数据模型（建议）

```sql
CREATE TABLE chatbot_faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  question_en TEXT NOT NULL,
  question_zh TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  answer_zh TEXT NOT NULL,
  keywords JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL
);
```

#### 后端 API（6 endpoints）

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| POST | `/api/v2/chatbot/faqs` | 创建 FAQ 条目 | ADMIN |
| GET | `/api/v2/chatbot/faqs` | FAQ 列表（管理视角） | ADMIN |
| GET | `/api/v2/chatbot/faqs/{id}` | 获取单条 | ADMIN |
| PATCH | `/api/v2/chatbot/faqs/{id}` | 更新 | ADMIN |
| DELETE | `/api/v2/chatbot/faqs/{id}` | 删除 | ADMIN |
| GET | `/api/v2/chatbot/analytics` | FAQ 命中/转人工统计 | ADMIN |

说明：该页面是 Admin 管理后台能力，不再定义为 PUBLIC 列表 API；患者/医院侧通过 Chatbot 运行时能力消费 FAQ。

#### 前端页面

| 模块 | 内容 |
|------|------|
| **筛选栏** | 搜索框 + 分类筛选 + 激活状态筛选 + "新建 FAQ" 按钮 |
| **FAQ 表格** | 问题（EN/ZH 截断）、分类 Badge、关键词、激活状态、操作（编辑/删除） |
| **创建/编辑 Modal** | 问题（EN/ZH）、答案（EN/ZH）、分类、关键词（tag input）、排序值、激活开关 |
| **Analytics 区块** | 总会话数、自动解决率、转人工率、Top 未命中问题（P1） |

#### Chatbot FAQ Validation Schema

```typescript
// packages/shared/validation/src/chatbot-faq.schema.ts
export const createChatbotFaqSchema = z.object({
  category: z.string().min(1).max(100),
  questionEn: z.string().min(1).max(1000),
  questionZh: z.string().min(1).max(1000),
  answerEn: z.string().min(1),
  answerZh: z.string().min(1),
  keywords: z.array(z.string().min(1)).default([]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateChatbotFaqSchema = createChatbotFaqSchema.partial();

export const chatbotFaqListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});
```

---

### 4.7 Settings (`/settings`) — Phase E

**后端需新建**。

#### 后端 API（3 endpoints）

| 方法 | 路径 | 说明 | 角色 |
|------|------|------|------|
| GET | `/api/v2/users/me` | 获取当前用户信息（页面初始化） | 已认证用户 |
| PATCH | `/api/v2/users/me` | 更新邮箱 + 语言偏好 | 已认证用户 |
| POST | `/api/v2/users/me/change-password` | 修改密码 | 已认证用户 |

**修改密码流程**：
1. 前端发送 `{ currentPassword, newPassword }`
2. 后端通过 Keycloak Admin API 验证旧密码 + 设置新密码
3. 成功后返回 200，前端显示成功提示

**更新邮箱/语言**：
1. 前端发送 `{ email?, preferredLanguage? }`
2. 后端更新 CRM `users` 表
3. 如更新 email，同步更新 Keycloak 用户信息

#### 前端页面

三个独立卡片：

| 卡片 | 内容 |
|------|------|
| **邮箱** | 当前邮箱（只读展示）+ "更改邮箱" 按钮 → 展开输入框 + 保存 |
| **密码** | "更改密码" 按钮 → 展开表单：当前密码 + 新密码 + 确认新密码 |
| **语言偏好** | 下拉选择 (English / 中文) + 保存按钮 |

页面不使用 DataTable，采用简单的 Card 布局。

#### Settings Validation Schema

```typescript
// packages/shared/validation/src/user-settings.schema.ts
export const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  preferredLanguage: z.enum(['en', 'zh']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
```

---

## 五、API 依赖清单

### 5.1 已就绪 API

| 领域 | 端点数 | 状态 |
|------|--------|------|
| Conversations + Messages | 14 | ✅ |
| Orders | 6 | ✅ |
| Packages | 6 | ✅ |
| Support Tickets | 7 | ✅ |
| Question Collectors | 10 | ✅ |
| Chatbot FAQ + Analytics | 6 | ❌（Phase E 新增） |
| User Settings | 3 | ⚠️（`GET/PATCH /users/me` + `change-password` 需统一落地） |

### 5.2 需新建 API

| API | 类型 | 优先级 |
|-----|------|--------|
| `chatbot-faq.schema.ts` 验证 schema | 新文件 | P0 |
| Chatbot FAQ 领域实体 + 仓储 | 全栈新建 | P0 |
| Chatbot FAQ CRUD + Analytics（6 endpoints） | 新路由 | P0 |
| Chatbot FAQ DB migration（`chatbot_faq_items` 表） | 新 migration | P0 |
| `user-settings.schema.ts` 验证 schema | 新文件 | P0 |
| `GET /api/v2/users/me` | 新路由（若未实现） | P0 |
| `PATCH /api/v2/users/me` | 新路由 | P0 |
| `POST /api/v2/users/me/change-password` | 新路由（需 Keycloak Admin API 凭据） | P0 |
| Settings DB migration（确认 `users` 表已有 `preferred_language` 列，若无则新增） | 检查/新增 | P0 |

---

## 六、BFF 路由清单

### 6.1 BFF 路由策略

**读取操作**使用 BFF Route Handler（`createQueryHandler` / `createParamQueryHandler`），供 React Query 客户端调用。

**写入操作**使用 Server Actions（`apiFetch` 直连后端 API），无需 BFF Route Handler。这与 Phase A+B 已建立的模式一致（如 `hospital-actions.ts`、`case-actions.ts`）。

### 6.2 新增 BFF 读取路由（`apps/admin/src/app/api/`）

| BFF 路由 | 后端 API | 用途 |
|---------|---------|------|
| `GET /api/packages` | `/api/v2/packages` | Packages 列表 |
| `GET /api/packages/[id]` | `/api/v2/packages/{id}` | Package 详情 |
| `GET /api/question-templates` | `/api/v2/question-templates` | QC 模板列表 |
| `GET /api/question-templates/[id]` | `/api/v2/question-templates/{id}` | QC 模板详情 |
| `GET /api/question-templates/[id]/customizations` | `/api/v2/question-templates/{id}/customizations` | QC 定制 |
| `GET /api/questionnaire-responses` | `/api/v2/questionnaire-responses` | QC 回答列表 |
| `GET /api/chatbot/faqs` | `/api/v2/chatbot/faqs` | Chatbot FAQ 列表 |
| `GET /api/chatbot/faqs/[id]` | `/api/v2/chatbot/faqs/{id}` | Chatbot FAQ 详情 |
| `GET /api/chatbot/analytics` | `/api/v2/chatbot/analytics` | Chatbot FAQ 统计 |
| `GET /api/users/me` | `/api/v2/users/me` | 当前用户信息 |
| `GET /api/orders/[id]` | `/api/v2/orders/{id}` | 订单详情（Phase A+B 漏建） |

### 6.3 写入操作通过 Server Actions

| Server Action 文件 | 操作 | 后端 API |
|-------------------|------|---------|
| `package-actions.ts` | createPackage, updatePackage, publishPackage, unpublishPackage | POST/PUT `/api/v2/packages` |
| `qc-actions.ts` | createTemplate, updateTemplate, customizeQuestions | POST/PUT `/api/v2/question-templates` |
| `chatbot-faq-actions.ts` | createFaq, updateFaq, deleteFaq | POST/PATCH/DELETE `/api/v2/chatbot/faqs` |
| `settings-actions.ts` | updateProfile, changePassword | PATCH `/api/v2/users/me`, POST `/api/v2/users/me/change-password` |

注：Messages、Orders、Support 的 BFF 路由 + Server Actions 在 Phase A+B 中已创建。

---

## 七、实施分期

### Phase C — Messages 消息中心

| # | 任务 | API 就绪？ |
|---|------|-----------|
| C1 | Messages 独立页面（全局对话列表 + 聊天窗口 + 审核） | ✅ |

### Phase D — 独立管理页面

| # | 任务 | API 就绪？ |
|---|------|-----------|
| D1 | Orders 独立列表页 | ✅ |
| D2 | Packages 套餐管理（列表 + 创建 + 编辑 + 发布/下架） | ✅ |
| D3 | Support Tickets 独立列表页 | ✅ |

### Phase E — 管理功能

**前置 API 任务：**

| # | 任务 | 说明 |
|---|------|------|
| E0a | Chatbot FAQ 全栈新建（schema + entity + repo + use cases + routes + migration） | 阻塞 Chatbot 页面 |
| E0b | Settings API 新建（getProfile + updateProfile + changePassword routes） | 阻塞 Settings 页面 |

**页面任务：**

| # | 任务 | API 就绪？ |
|---|------|-----------|
| E1 | Question Collectors 模板管理（含双语字段 + 条件逻辑结构） | ✅（增强） |
| E2 | Chatbot & FAQ 管理页面 | ⚠️ 依赖 E0a |
| E3 | Settings 个人设置页面 | ⚠️ 依赖 E0b |

### 前置任务（先于所有页面）

| # | 任务 |
|---|------|
| S1 | 更新 AdminShell 侧边栏 NAV_ITEMS + getActiveKey()（所有新页面需要导航入口） |

---

## 八、错误、加载与空状态处理

沿用 Phase A+B 的模式：
- API 失败 → Toast 通知 + 重试
- 加载中 → Skeleton Loader
- 列表为空 → EmptyState 组件
- 表单验证 → 即时校验 + 提交时全量校验
