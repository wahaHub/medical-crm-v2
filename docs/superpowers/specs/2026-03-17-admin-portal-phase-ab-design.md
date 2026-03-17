# Admin Portal Phase A+B 设计文档

> 日期：2026-03-17
> 范围：Phase A（核心骨架）+ Phase B（多医院工作流）
> 基于：admin-portal-analysis.md + v1 Hospital Detail/New Hospital 参考

---

## 一、设计决策汇总

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 实施范围 | Phase A + B | 核心骨架 + 多医院报价是差异化功能，API 全就绪 |
| 组件策略 | 基础共享 + 业务独立 | shared/ui 的 DataTable/Card/Modal 复用，业务组件 Admin 独立编写 |
| Case Detail Tab | 10 个 | 覆盖完整业务流程 |
| 认证方案 | 复用同一 Keycloak client | apps/admin 已有 PKCE 骨架，API 层 toActor() 已识别 admin role |
| 缺失 API | 前端先行，API 后补 | 大部分核心 API 就绪，6 个 P0 阻塞项需先修复（见 §4.2 + §7 前置任务） |
| Dashboard | 精简版 | 统计卡片 + 最近案例 + 待办事项 |

---

## 二、技术架构

### 2.1 技术栈

沿用 Hospital Portal 同一套技术栈：

- **Next.js 15** (React 19) — `apps/admin/`（端口 3002）
- **Tailwind CSS v4** — 样式
- **TanStack React Query v5** — 数据获取与缓存
- **Lucide React** — 图标
- **Framer Motion** — 动画
- **Keycloak confidential client with PKCE + iron-session** — 认证（与 Hospital Portal 一致）
- **@medical-crm/ui** — 共享 UI 组件
- **@medical-crm/validation** — Zod schema 校验

### 2.2 路由结构

```
apps/admin/src/app/
├── (portal)/                    # 需认证的页面
│   ├── layout.tsx              # AdminShell（侧边栏 + 顶栏）
│   ├── page.tsx                # Dashboard
│   ├── cases/
│   │   ├── page.tsx            # Cases 列表
│   │   ├── new/page.tsx        # 创建 Case（临时入口，待 CompleteSignup 实现后评估移除）
│   │   └── [id]/page.tsx       # Case Detail（10 Tab）
│   └── hospitals/
│       ├── page.tsx            # Hospitals 列表
│       ├── new/page.tsx        # 创建 Hospital
│       └── [id]/page.tsx       # Hospital Detail
├── auth/                        # 已有骨架（Route Handlers）
│   ├── login/route.ts          # Keycloak PKCE 重定向
│   ├── callback/route.ts       # OAuth callback 处理
│   └── logout/route.ts
├── middleware.ts                # Auth 中间件：检查 session cookie，未认证重定向 /auth/login
└── api/                         # BFF API 路由（按资源分组，参照 Hospital Portal）
    ├── cases/route.ts
    ├── cases/[id]/route.ts
    ├── hospitals/route.ts
    ├── hospitals/[id]/route.ts
    ├── conversations/route.ts
    ├── conversations/[id]/messages/route.ts
    ├── dashboard/route.ts
    └── ...                     # 其余按需添加
```

**注意：保留 `/cases/new` 路由作为临时入口。** 虽然正式流程中 Case 由 Patient booking 产生，但 `CompleteSignup` 端点目前返回 501 Not Implemented，Patient 无法自助完成注册。在该 API 实现之前，Admin 需要能手动创建 Case（`POST /api/v2/cases` 已支持 ADMIN 角色）。待 `CompleteSignup` 上线后可评估是否移除此入口。

### 2.3 数据层架构

沿用 Hospital Portal 的模式：

```
apps/admin/src/
├── components/             # Admin 业务组件
│   ├── admin-shell.tsx
│   ├── dashboard-widgets.tsx
│   ├── cases-list.tsx
│   ├── case-detail-tabs.tsx
│   ├── hospitals-list.tsx
│   ├── hospital-detail.tsx
│   ├── hospital-review.tsx
│   └── new-hospital-form.tsx
├── queries/                # React Query hooks（按 Phase 逐步添加）
│   ├── use-cases.ts            # Phase A
│   ├── use-hospitals.ts        # Phase A
│   ├── use-dashboard.ts        # Phase A
│   ├── use-conversations.ts    # Phase B
│   ├── use-consultations.ts    # Phase B
│   ├── use-orders.ts           # Phase B
│   └── use-tickets.ts          # Phase B
├── actions/                # Server Actions（按 Phase 逐步添加）
│   ├── hospital-actions.ts     # Phase A
│   ├── case-actions.ts         # Phase A
│   ├── message-actions.ts      # Phase B
│   ├── consultation-actions.ts # Phase B
│   └── order-actions.ts        # Phase B
└── lib/                    # 基础设施（从 Hospital Portal 复制/适配）
    ├── api-client.ts       # 已有，复用 fetch + token refresh
    ├── api-fetch.ts        # 底层 fetch 封装（从 hospital 复制）
    ├── api-types.ts        # Admin 专用 API 类型
    ├── auth-context.tsx    # Auth React Context
    ├── keycloak-client.ts  # Keycloak JWT 处理（已有）
    ├── session.ts          # 已有，iron-session 管理
    ├── session-helpers.ts  # Session 辅助函数（从 hospital 复制）
    ├── query-provider.tsx  # QueryClientProvider 包裹（在 (portal)/layout.tsx 中注入）
    ├── query-client.ts     # QueryClient 实例配置
    ├── query-fetch.ts      # React Query 专用 fetch 封装
    ├── route-handler-helpers.ts  # BFF route handler 辅助函数
    └── errors.ts           # 错误类型定义
```

- **Server Components** — 页面级数据获取（`apiClient()`）
- **Client Components** — 交互组件（`useQuery` / `useMutation`）
- **Server Actions** — 表单提交等 mutation
- **React Query hooks** — 封装数据获取逻辑

### 2.4 Admin Shell

复用 `@medical-crm/ui` 的 `SidebarNav` 组件，Admin 侧边栏菜单：

| 图标 | 标签 | 路由 | Badge |
|------|------|------|-------|
| LayoutDashboard | Dashboard | `/` | — |
| FolderOpen | Cases | `/cases` | 活跃案例数 |
| Building2 | Hospitals | `/hospitals` | — |

顶栏：用户头像 + 角色标识（Admin）+ 通知铃铛（空状态占位）+ 退出登录。

---

## 三、页面详细设计

### 3.1 Dashboard (`/`)

**数据源**：`GET /api/v2/admin/dashboard`

**`AdminDashboardDTO` 实际返回结构：**
```typescript
{
  stats: { totalCases, unassignedCases, assignedCases, openTickets, pendingOrders },
  recentCases: Array<{ id, caseNumber, assignmentStatus, createdAt }>
}
```

| 模块 | 内容 | 数据映射 | 组件 |
|------|------|----------|------|
| 统计卡片行 | 总案例 / 未分配案例 / 已分配案例 / 待处理工单 / 待处理订单 | `stats.totalCases` / `stats.unassignedCases` / `stats.assignedCases` / `stats.openTickets` / `stats.pendingOrders` | `StatCard` (shared/ui) |
| 最近案例 | Case 列表：案例编号、分配状态、创建时间 | `recentCases[]` — 注意：DTO 不含患者名/阶段，仅有 `caseNumber` + `assignmentStatus` + `createdAt` | `DataTable` (shared/ui) |
| 快捷操作 | "查看所有案例" / "查看所有医院" 跳转链接 | 纯前端 | `Button` (shared/ui) |

**⚠️ 注意：** 原设计中的"待审核消息数 + 待回复报价数"待办事项无法从 Dashboard API 获取。如需此功能，需额外调用 `GET /api/v2/messages/pending-review`（获取待审核消息数）。可作为后续增强。

### 3.2 Cases 列表 (`/cases`)

**数据源**：`GET /api/v2/cases` + `GET /api/v2/cases/stats`

| 模块 | 内容 |
|------|------|
| 统计卡片 | 对应 `CaseStatsDTO` 全部 7 个字段：总数（`total`）/ 未分配（`unassigned`）/ 已分配（`assigned`）/ 治疗中（`inTreatment`）/ 术后（`postTreatment`）/ 已完成（`completed`）/ 随访（`followUp`）。展示为 7 个 StatCard，不遗漏任何状态 |
| 筛选栏 | 搜索框（`search`）+ 状态下拉（`assignmentStatus`）+ 阶段下拉（`treatmentStage`）— 仅使用 `caseListQuerySchema` 已支持的参数。注：无日期范围过滤（schema 不支持） |
| 案例表格 | 案例编号（`caseNumber`）、患者名（`patientName`）、状态 Badge（`status`）、阶段（`stage`）、分配状态（`assignmentStatus`）、创建日期（`createdAt`）— 均为 `CaseDTO` 已有字段。注：`CaseDTO` 不含医院数/报价数，不显示这两列 |

**"新建案例" 按钮** → `/cases/new`（临时入口，因 `CompleteSignup` 尚未实现）。

### 3.3 Case Detail (`/cases/[id]`) — 10 Tab

**数据源**：`GET /api/v2/cases/{id}` + 各 Tab 独立 API

顶部显示：Case 基本信息（患者名、状态 Badge、阶段 Badge）

| # | Tab | 数据源 API | 核心内容 |
|---|-----|-----------|----------|
| 1 | **Overview** | `GET /cases/{id}` + `GET /cases/{caseId}/documents` | 基本信息卡片 + 文档列表 + 上传入口 |
| 2 | **Multi-Hospital Quotes** | `GET /cases/{caseId}/hospital-contacts` + `GET /cases/{caseId}/quotes/compare` | 已邀医院列表 + 报价对比表 + 提醒/移除操作 |
| 3 | **Timeline** | `GET /cases/{caseId}/timeline` | 时间线事件流（垂直时间轴组件） |
| 4 | **Messages** | `GET /conversations?caseId={id}` + `GET /conversations/{convId}/messages` | 左侧对话列表 + 右侧聊天窗口 |
| 5 | **Medical Intake** | `GET /cases/{caseId}/questionnaire` | 问卷回答只读展示 |
| 6 | **Journey** | `GET /cases/{caseId}/journey` + `GET /cases/{caseId}/milestones` | 签证/住宿/交通信息卡片 + 里程碑列表 |
| 7 | **Consultations** | `GET /cases/{caseId}/consultations` | 问诊记录列表（时间、医院、状态、录像链接） |
| 8 | **Orders** | `GET /orders?caseId={id}` | 关联订单列表 + 状态（只读查看，**无退款按钮** — `RequestRefundUseCase` 仅允许 PATIENT 角色） |
| 9 | **Support** | `GET /tickets`（全局列表，⚠️ 无 `caseId` 过滤） | 关联工单列表 + 回复 + 状态管理。**API 缺口：`ticketListQuerySchema` 不支持 `caseId` 过滤，需扩展 schema 或前端仅显示全局链接** |
| 10 | **AI Summary** | `GET /cases/{id}` → `CaseDTO.aiSummary` | AI 案例摘要（`aiSummary` 字段已在 `CaseDTO` 中，直接从 Overview 数据读取，无需独立 API） |

**Tab 实现策略**：使用 `@medical-crm/ui` 的 `Tabs` 组件，每个 Tab 内容为独立 Client Component，各自管理 React Query 数据获取（lazy load，切换到该 Tab 时才请求）。

#### Tab 1: Overview

- **基本信息卡片**：患者名、国籍（`patientCountry`）、语言（`patientLanguage`）、主诊断（`primaryDiagnosis`）、风险等级（`riskLevel`）、分配状态（`assignmentStatus`）、治疗阶段（`treatmentStage`）
- **状态操作**：阶段推进按钮（`PATCH /cases/{id}/stage`）、状态更新下拉（`PATCH /cases/{id}/status`）
- **文档区域**：文档列表（`GET /cases/{caseId}/documents`）+ 上传按钮（`POST /cases/{caseId}/documents`，FormData）+ 删除操作（`DELETE /cases/{caseId}/documents/{docId}`）
- **组件**：`Card` + `StatusBadge` + `Button` + `DataTable`（文档列表）

#### Tab 2: Multi-Hospital Quotes

- **已邀医院列表**：来自 `GET /cases/{caseId}/hospital-contacts`，显示医院名、邀请状态、邀请时间
  - 每行操作：发送提醒（`POST /hospital-contacts/{id}/remind`）、移除（`PATCH /hospital-contacts/{id}/remove`）
- **添加医院**：按钮打开 Modal → 搜索医院 → `POST /cases/{caseId}/hospital-contacts` body: `{ hospitalId }`
- **报价对比表**：来自 `GET /cases/{caseId}/quotes/compare`，表格对比各医院报价明细（项目、金额、总价），**Admin 仅查看对比表，不操作个别报价**
- **注意**：接受/拒绝报价（`POST /quotes/{id}/accept` / `reject`）是 **Patient 端操作**，Admin Portal 不提供此功能，也不提供单个报价详情页
- **组件**：`DataTable` + `Modal` + `StatusBadge`

#### Tab 3: Timeline

- **垂直时间轴**：来自 `GET /cases/{caseId}/timeline`，按时间倒序展示事件
- 每个事件节点显示：事件类型图标、事件描述、时间戳、操作人
- 事件类型包括：案例创建、状态变更、医院邀请、报价发送/接受/拒绝、消息发送、文档上传等
- **组件**：自定义 `TimelineView`（垂直时间轴，使用 Lucide 图标区分事件类型）

#### Tab 4: Messages（复用 Hospital Portal 组件）

**与 Hospital Portal 的 Messages 页面结构基本一致**，核心 UI 组件可复用。

- **左侧对话列表**：来自 `GET /conversations?caseId={id}`，显示对话类型（Admin↔Patient / Admin↔Hospital / Hospital↔Patient）+ 最后消息预览 + 未读数
- **右侧聊天窗口**：选中对话后，`GET /conversations/{convId}/messages` 加载消息列表
  - 消息气泡：发送者头像 + 内容 + 时间 + 翻译结果（如有）
  - 发送消息：输入框 + `POST /conversations/{convId}/messages`
  - 消息操作：重新翻译（`POST /messages/{msgId}/retranslate`）、重新生成摘要（`POST /messages/{msgId}/regenerate-summary`）
- **消息审核**（Admin 独有）：待审核消息高亮显示，提供审核/拒绝操作（`POST /messages/{msgId}/approve` / `reject`）
- **复用组件**：`ChatLayout`（`@medical-crm/ui`，已支持翻译切换、附件预览、多消息类型）+ `Avatar` + `Button`
- **Admin 差异点**：仅增加消息审核高亮 + approve/reject 按钮，其余 UI 与 Hospital Portal 完全一致

#### Tab 5: Medical Intake（复用 Hospital Portal 组件）

**与 Hospital Portal 的 Medical Intake Tab 结构一致**，同为只读展示，可直接复用。

- **只读展示**：来自 `GET /cases/{caseId}/questionnaire`
- 按问卷模板结构展示：问题标题 + 患者回答（文本/单选/多选/文件）
- 如无回答，显示 `EmptyState`："患者尚未填写问卷"
- **复用策略**：将问卷展示组件提取到 `@medical-crm/ui` 或 `packages/shared/` 中作为 `QuestionnaireReadonlyView`，Admin 和 Hospital 共用
- **组件**：`Card` + `EmptyState` + `QuestionnaireReadonlyView`（待提取到 shared）

#### Tab 6: Journey

- **行程信息卡片**：来自 `GET /cases/{caseId}/journey`
  - 签证信息：状态、签证类型、申请日期、获批日期
  - 保险信息：保险商、保单号、覆盖范围
  - 住宿信息：酒店名、入住/退房日期、地址
  - 交通信息：航班号、出发/到达时间
  - 术后安排：随访日期、注意事项
- **里程碑列表**：来自 `GET /cases/{caseId}/milestones`
  - 每个里程碑：标题、类别、状态（completed/pending/overdue）、日期
  - 操作：新增（`POST /milestones`）、更新状态（`PATCH /milestones/{id}`）、删除（`DELETE /milestones/{id}`）
- **编辑行程**：`PUT /cases/{caseId}/journey` 更新各项信息
- **组件**：`Card` + `StatusBadge` + `DataTable` + `Modal`（编辑表单）

#### Tab 7: Consultations（复用 Hospital Portal 组件）

**与 Hospital Portal 的 Consultations 页面（已完成问诊列表部分）结构一致**，核心列表和详情组件可复用。

- **问诊列表**：来自 `GET /cases/{caseId}/consultations`
  - 每行显示：医院 ID（`hospitalId`，⚠️ `ConsultationDTO` 无 `hospitalName`，需 BFF 层关联查询或前端缓存医院名映射）、预约时间（`scheduledAt`）、时长（`durationMinutes`）、状态
  - 已完成的问诊：`videoStorageKey` 非空时显示"查看录像"链接（⚠️ `videoStorageKey` 是存储键而非直接可用 URL，需 BFF 层生成签名 URL 或前端通过存储服务转换）
- **问诊详情**：点击展开或打开 Modal → `GET /consultations/{id}` + `GET /consultations/{id}/transcript`（问诊记录文字版）
- ~~统计~~：`GET /consultations/stats` **仅限 HOSPITAL 角色**（`GetConsultationStatsUseCase` 拒绝非 HOSPITAL actor），Admin 不显示此模块
- **复用策略**：将问诊列表卡片 + 详情 Modal + Transcript Modal 提取到 `@medical-crm/ui` 或 `packages/shared/` 中作为 `ConsultationListView` + `TranscriptModal`，Admin 和 Hospital 共用。Hospital 额外有统计卡片和创建问诊功能，Admin 只读
- **组件**：`DataTable` + `StatusBadge` + `Modal` + `ConsultationListView`（待提取到 shared）+ `TranscriptModal`（待提取到 shared）

#### Tab 8: Orders（只读）

- **订单列表**：来自 `GET /orders?caseId={id}`（已确认 `orderListQuerySchema` 支持 `caseId` 过滤）
  - 每行显示：订单号（`orderNumber`）、套餐 ID（`packageId`，⚠️ `OrderDTO` 无 `packageName`，需额外查询或显示 ID）、金额（`amount` + `currency`）、状态、创建时间
  - 状态枚举（6 个，全部需处理 Badge 样式）：`PENDING_PAYMENT` / `PAID` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED` / `REFUNDED`
- **订单详情**：点击展开 → `GET /orders/{id}`，显示支付方式、支付时间、退款金额/原因
- **注意**：Admin 只读查看，无退款按钮（`RequestRefundUseCase` 仅允许 PATIENT）
- **组件**：`DataTable` + `StatusBadge` + `Card`

#### Tab 9: Support

- **工单列表**：来自 `GET /tickets?caseId={id}`（⚠️ 依赖 B0a schema 扩展）
  - 每行显示：工单号、类型、优先级 Badge、状态、创建时间、分配给
- **工单详情**：点击展开 → `GET /tickets/{id}`
  - 工单信息 + 回复历史
  - 回复操作：`POST /tickets/{id}/reply`
  - 状态管理：分配（`POST /tickets/{id}/assign`）、更新状态（`PATCH /tickets/{id}/status`）、关闭（`POST /tickets/{id}/close`）
- **组件**：`DataTable` + `StatusBadge` + `Modal` + 回复文本框

#### Tab 10: AI Summary

- **摘要展示**：来自 `CaseDTO.aiSummary` 字段（在 Overview 数据中已获取，无需额外 API）
- 以 Markdown 渲染展示 AI 生成的案例摘要
- 如 `aiSummary` 为 `null`，显示 `EmptyState`："暂无 AI 摘要"
- **组件**：`Card` + Markdown 渲染器 + `EmptyState`

### 3.4 Hospitals 列表 (`/hospitals`)

**数据源**：`GET /api/v2/hospitals`

| 模块 | 内容 |
|------|------|
| 筛选栏 | 搜索框 + 类型筛选（COSMETIC / REGULAR）+ 状态筛选（已审核/待审核/已停用） |
| 医院表格 | 名称、类型 Badge、状态 Badge、专科标签、创建日期（注：`HospitalDTO` 不含案例数字段，不显示关联案例数） |
| 操作 | "新建医院" 按钮 → `/hospitals/new` |

### 3.5 Hospital Detail (`/hospitals/[id]`)

**数据源**：`GET /api/v2/hospitals/{id}` + `GET /api/v2/hospitals/{id}/cases`

| 模块 | 内容 |
|------|------|
| **基本信息卡片** | 名称、类型 Badge、地址、电话、邮箱、描述 |
| **专科标签** | 医院擅长专科，Badge 展示 |
| **关联案例表格** | 来自 `GET /hospitals/{id}/cases`，显示案例编号、状态、创建时间（复用 DataTable） |
| **邀请链接管理** | "重新发送邀请链接" 按钮（用于令牌过期后重发）→ 弹出邮箱确认框 → `POST /hospitals/{id}/registration-token` body: `{ email }` |
| **宣传材料审核**（底部） | 见下方详细设计 |

**⚠️ 以下模块暂不实现（API 缺口）：**
- ~~统计卡片（关联案例数 / 活跃 / 已完成）~~ — `/hospitals/{id}/cases` 是分页接口，前端聚合不可行（会产生不正确的总数）。**Phase A 不显示统计卡片**，后续通过 `GET /hospitals/{id}/stats` 新 API 支持。
- ~~医院账号列表~~ — `HospitalDTO` 无 user/account 字段，需新增 `GET /hospitals/{id}/users` API。**Phase A 不显示该模块。**

#### 宣传材料审核区域（参照 v1）

- 医院状态 Badge：已审核（绿）/ 待审核（黄）/ 已停用（红）
- 审核操作按钮（严格遵循 domain 状态机 `HOSPITAL_STATUS_TRANSITIONS`）：
  - `PENDING` → 显示 **"审核通过"** 按钮 → `{ status: "ACTIVE" }`（唯一合法转换）
  - `ACTIVE` → 显示 **"停用医院"** 按钮 → `{ status: "INACTIVE" }`（唯一合法转换，需二次确认弹窗）
  - `INACTIVE` → 显示 **"重新激活"** 按钮 → `{ status: "ACTIVE" }`（唯一合法转换）
  - **注意：不存在 ACTIVE→PENDING 或 INACTIVE→PENDING 的转换。** 无"撤回审核"操作。
- ~~消费者网站链接预览~~ — **`HospitalDTO` 无 website/public URL 字段，Phase A 不显示此项。** 后续可通过 Supabase 查询获取公开页面 URL，或扩展 `HospitalDTO` 增加 `publicUrl` 字段。
- **⚠️ Supabase 同步缺口：** 当前 `update-hospital-status.use-case.ts` 未调用 Supabase 同步服务。且 China 同步逻辑只映射 `ACTIVE→approved`，其余映射为 `pending`（无 `INACTIVE` 对应）。状态变更目前仅更新 CRM 数据库。如需同步到消费者网站，需在 Phase A 实现时补充同步逻辑。

### 3.6 New Hospital (`/hospitals/new`)

**数据源**：`POST /api/v2/hospitals`（需扩展 schema）

**一步流程：** 扩展 `createHospitalSchema`，将 `specialties` 纳入创建请求。用户在一个表单中填写所有信息，一次提交完成创建。

#### 前置 API 修改

当前 `createHospitalSchema` 仅接受 6 个基础字段（`name`, `type`, `contactEmail`, `contactPhone`, `address`, `description`），需扩展为：

```typescript
// 扩展后的 createHospitalSchema
export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: hospitalTypeSchema,
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),              // 新增：城市（REGULAR 类型推荐填写）
  description: z.string().optional(),
  specialties: z.array(z.string()).min(1),  // 新增：至少选 1 个专科
});
```

同步修改 `CreateHospitalUseCase`，将 `specialties` 写入 Hospital 实体。

#### 表单字段

| 字段 | 必填 | 条件 | API 字段名 |
|------|------|------|-----------|
| 医院名称 | ✅ | — | `name` |
| 医院类型 | ✅ | — | `type`: `COSMETIC` / `REGULAR` |
| 地址 | ❌ | — | `address` |
| 城市 | ❌ | REGULAR 类型推荐填写 | `city` |
| 电话 | ❌ | — | `contactPhone` |
| 邮箱 | ✅ | — | `contactEmail`（schema 要求 `z.string().email()`） |
| 描述 | ❌ | — | `description` |
| 专科选择 | ✅ | 至少 1 个 | `specialties` (string[])，多选 Badge，列表根据类型动态切换（见下方） |

提交 → `POST /api/v2/hospitals`（扩展后，含 specialties）→ 一步创建完成

**专科列表（根据医院类型动态切换）：**

| 类型 | 数据来源 | 分类 |
|------|----------|------|
| **COSMETIC** | Main Supabase `procedures` 表 | Face / Body / Non-surgical |
| **REGULAR** | China Medical Supabase `hospital_i18n.departments_info` | 心脏科、肿瘤科、骨科等 18 个科室 |

切换类型时重置已选专科。

**⚠️ BFF 缺口：** 当前无 BFF 路由获取专科选项列表。需新增：
- `GET /api/specialties?type=COSMETIC` — 从 Main Supabase 查询 `procedures` 表
- `GET /api/specialties?type=REGULAR` — 返回 REGULAR 科室列表

实现路径：`apps/admin/src/app/api/specialties/route.ts`（Next.js App Router 对应 URL `/api/specialties`）。

#### 创建后自动流程（参照 v1）

v1 的创建医院流程是：创建 → 自动生成 registration token → 自动发送邀请邮件。v2 需复现此行为：

1. `POST /api/v2/hospitals`（扩展后，含 specialties）→ 一步创建完整医院，得到 `hospitalId`
2. `POST /api/v2/hospitals/{id}/registration-token` body: `{ email: "<创建时填的contactEmail>" }` → 生成 72 小时注册令牌，返回 `{ token, expiresAt }`
3. **⚠️ 邮件发送缺口：** 当前 `GenerateRegistrationTokenUseCase` 仅持久化 token 到数据库，**不发送邮件**。v1 在创建医院时调用 `sendHospitalInvitationEmail()` 发送邀请。v2 需要补充邮件发送逻辑（在 use case 中注入邮件服务，或在 BFF 层调用 token API 后额外触发邮件）。
4. 成功提示："医院创建成功！注册令牌已生成。"（邮件功能补充后改为"已发送邀请链接"）
5. 自动跳转到医院详情页 `/hospitals/{newId}`

**步骤 1~2 在前端连续调用**，用户只需点一次"提交"。

**错误恢复策略：**
- **Step 1 失败**（创建）：直接报错，无需回滚
- **Step 2 失败**（生成 token）：医院已完整创建。提示用户"医院创建成功，但令牌生成失败"，跳转到 Hospital Detail，用户可通过"重新生成令牌"按钮重试
- 任何步骤失败都不阻塞已完成的步骤（与 v1 行为一致：邮件发送失败不影响医院创建）

Hospital Detail 页面保留 **"重新生成令牌"** 按钮（弹出邮箱确认框 → `POST /registration-token` body: `{ email }`）。

### 3.7 Hospital Registration (`/auth/hospital/register`)

**数据源**：无需认证（公开页面），通过 URL query `?token=xxx` 验证身份

**参照 v1**：v1 有完整的医院注册页面 `/auth/hospital/register`，医院用户通过邀请邮件中的链接访问，设置账号完成注册。v2 需复现此页面。

**⚠️ 此页面不在 Admin Portal 的认证保护内**，是独立的公开页面。可放在 `apps/admin/src/app/auth/hospital/register/page.tsx`（复用 Admin 的 auth 路由组），或放在单独的路由组中。

#### 页面流程

1. **Token 验证**：页面加载时，`GET /api/v2/auth/hospital/register?token=xxx` 验证 token 有效性（未过期、未使用）
   - **有效**：显示注册表单，同时展示医院名称和邮箱（只读）
   - **无效**：显示错误卡片，提示可能原因（已过期/已使用/无效链接）

2. **注册表单字段**：

| 字段 | 必填 | 验证规则 |
|------|------|----------|
| 医院信息（只读） | — | 显示医院名称 + 邀请邮箱（从 token 数据获取） |
| 用户名 | ✅ | 3-20 字符，仅允许字母/数字/下划线/连字符 `^[a-zA-Z0-9_-]+$` |
| 密码 | ✅ | 最少 8 字符 |
| 确认密码 | ✅ | 必须与密码一致 |

3. **提交**：`POST /api/v2/auth/hospital/register` body: `{ token, username, password }`
   - 在 Keycloak 中创建用户（角色根据医院类型：`hospital` for COSMETIC, `regular_hospital` for REGULAR）
   - 在 CRM 数据库创建用户记录
   - 标记 registration token 为已使用
   - 成功后显示"注册成功！"，3 秒后自动跳转到 Hospital Portal 登录页

#### 前置 API 需求

当前 v2 缺少注册相关的 API 端点，需新增：
- `GET /api/v2/auth/hospital/register?token=xxx` — 验证 token，返回医院名、邮箱、过期时间
- `POST /api/v2/auth/hospital/register` — 接受 token + username + password，创建 Keycloak 用户 + CRM 用户记录

v1 实现参考：`medical-crm/app/auth/hospital/register/page.tsx` + `medical-crm/app/api/auth/hospital/register/route.ts`

#### UI 设计

- 独立页面，不使用 Admin Shell（无侧边栏/顶栏）
- 居中卡片布局，顶部 Medora Health Logo
- 渐变背景（teal/emerald，与 v1 一致）
- 状态切换：加载中（验证链接）→ 表单 → 成功/错误

---

## 四、API 依赖清单

### 4.1 已就绪 API（直接使用）

| 领域 | 端点数 | 状态 |
|------|--------|------|
| Cases CRUD + Status + Stage | 7 | ✅ |
| Hospital Contacts + Quotes | 14 | ✅ |
| Hospitals CRUD + Status | 7 | ✅ |
| Conversations + Messages | 14 | ✅ |
| Consultations | 8 | ✅ |
| Documents | 3 | ✅ |
| Case Events + Timeline | 2 | ✅ |
| Admin Dashboard | 1 | ✅ |
| Orders | 6 | ✅ |
| Support Tickets | 7 | ✅ |
| Journey + Milestones | 6 | ✅ |
| Question Collector | 8 | ✅ |

### 4.2 缺失/需扩展 API

| API | 类型 | 用途 | 影响页面 | 优先级 |
|-----|------|------|----------|--------|
| 扩展 `createHospitalSchema` 增加 `specialties` + `city` 字段 | Schema 扩展 | 一步创建医院（含专科 + 城市） | New Hospital | **P0（阻塞 New Hospital）** |
| Admin BFF `GET /api/specialties` 路由 | 新 BFF 路由 | 获取专科选项列表（按类型） | New Hospital | **P0（阻塞 New Hospital）** |
| `GET /api/v2/auth/hospital/register` (验证 token) | 新 API | 医院注册页 token 验证 | Hospital Registration | **P0（阻塞注册流程）** |
| `POST /api/v2/auth/hospital/register` (创建用户) | 新 API | 医院注册页提交（Keycloak + CRM 用户） | Hospital Registration | **P0（阻塞注册流程）** |
| `GenerateRegistrationTokenUseCase` 增加邮件发送 | 逻辑补充 | 生成 token 后自动发邀请邮件 | New Hospital 创建流程 | **P0（阻塞完整创建流程）** |
| `ticketListQuerySchema` 增加 `caseId` 过滤 | Schema 扩展 | 按案例过滤工单 | Case Detail → Support Tab | **P0（阻塞 Support Tab）** |
| `GET /hospitals/{id}/users` | 新 API | 医院用户账号列表（角色、最后登录） | Hospital Detail 账号列表 | P1（暂不显示该模块） |
| `GET /hospitals/{id}/stats` | 新 API | 医院统计（案例数、活跃、已完成） | Hospital Detail 统计卡片 | P1（暂不显示） |
| `update-hospital-status` 增加 Supabase 同步 | 逻辑修复 | 状态变更同步到消费者网站 | Hospital Detail 审核操作 | P1（当前仅更新 CRM DB） |
| `RequestRefundUseCase` 支持 ADMIN 角色 | 权限扩展 | Admin 代操作退款 | Case Detail → Orders Tab | P1（当前 Admin 只读） |
| Consultation hospitalName 关联 | BFF 增强 | 问诊列表显示医院名而非 ID | Consultations Tab | P1（可先显示 ID） |
| Video 签名 URL 生成 | BFF 增强 | 将 videoStorageKey 转为可访问 URL | Consultations Tab 录像链接 | P1（可先隐藏录像链接） |
| ~~`GET /cases/{id}/ai-summary`~~ | ~~不需要~~ | `CaseDTO.aiSummary` 已包含摘要数据 | — | — |

### 4.3 可选增强 API（不阻塞，后续优化）

| API | 用途 |
|-----|------|
| `GET /orders/stats` | Dashboard 订单统计卡片 |
| `GET /tickets/stats` | Dashboard 工单统计卡片 |
| `GET /users` | Dashboard 最近用户列表 |

---

## 五、组件共享策略

### 5.1 复用 `@medical-crm/ui` 的基础组件

| 组件 | 用途 |
|------|------|
| `SidebarNav` | Admin Shell 侧边栏 |
| `DataTable` | Cases/Hospitals/Orders/Tickets 列表 |
| `Card` / `CardHeader` / `CardTitle` | 信息卡片 |
| `Tabs` | Case Detail 10 Tab |
| `StatusBadge` | 状态标识 |
| `StatCard` | 统计卡片 |
| `Modal` / `ConfirmDialog` | 弹窗 |
| `ChatLayout` | Messages Tab 聊天界面 |
| `SearchInput` | 搜索栏 |
| `Button` | 按钮 |
| `Avatar` | 头像 |
| `EmptyState` | 空状态 |
| `LoadingSpinner` | 加载状态 |
| `PageHeader` | 页面标题 |

### 5.2 Admin 独立编写的业务组件

| 组件 | 理由 |
|------|------|
| `admin-shell.tsx` | 菜单项不同于 Hospital |
| `cases-list.tsx` | 多了 multi-hospital 状态列 + "新建案例"临时入口按钮 |
| `case-detail-tabs.tsx` | 10 Tab vs Hospital 的简单视图 |
| `hospitals-list.tsx` | 有审核状态筛选 |
| `hospital-detail.tsx` | 有宣传材料审核区域 |
| `hospital-review.tsx` | 审核操作逻辑 |
| `new-hospital-form.tsx` | 双类型表单 + 动态专科列表 |
| `dashboard-widgets.tsx` | Admin 特有统计 |
| `quote-comparison.tsx` | 多医院报价对比表 |
| `timeline-view.tsx` | 垂直时间轴 |

### 5.3 从 Hospital Portal 提取到 shared 的复用组件

Admin Portal 的 Messages Tab、Medical Intake Tab、Consultations Tab 与 Hospital Portal 对应部分 UI 结构基本一致，应从 Hospital Portal 提取核心渲染逻辑到 `packages/shared/` 或 `@medical-crm/ui`，双端复用。

| 提取组件 | 来源文件（Hospital Portal） | 提取位置 | 复用方式 |
|----------|---------------------------|----------|----------|
| `ConversationList` | `messages-view.tsx` 左侧对话列表 | `@medical-crm/ui` | Admin 和 Hospital 共用，Admin 额外传入 `showModeration` prop 显示审核操作 |
| `ChatWindow` | `messages-view.tsx` 右侧聊天窗口 | `@medical-crm/ui`（已有 `ChatLayout`） | 已有 `ChatLayout` 组件，直接复用。Admin 在消息气泡上叠加审核按钮 |
| `QuestionnaireReadonlyView` | `case-detail-panel.tsx` Intake Tab（6 步问卷展示） | `packages/shared/ui` | Admin 和 Hospital 完全相同，只读展示，无差异 |
| `ConsultationListView` | `consultations-list.tsx` 问诊列表 + 状态 Tab | `packages/shared/ui` | Admin 和 Hospital 共用列表渲染。Hospital 额外有统计卡片 + 创建问诊功能，Admin 只读 |
| `TranscriptModal` | `consultations-list.tsx` 问诊记录弹窗 | `packages/shared/ui` | Admin 和 Hospital 完全相同 |

**提取原则：**
- 提取的是**纯展示 + 数据接口**的组件，不含 server action 或 API 调用逻辑
- 各端通过 props/callbacks 注入数据获取和操作行为（如 `onSendMessage`、`onApprove`）
- Hospital 端现有组件改为 import shared 组件 + 包装业务逻辑
- Admin 差异点（消息审核、只读限制）通过 props 控制，不 fork 组件

---

## 六、认证流程

复用已有 `apps/admin/` 的 Keycloak 骨架（confidential client with PKCE，与 Hospital Portal 一致）：

1. 用户访问 Admin Portal → `middleware.ts` 检查 `medical-crm-admin-session` cookie
2. 无 session → 重定向 `/auth/login`（Route Handler）→ 构造 Keycloak PKCE 授权 URL → 302 重定向
3. Keycloak 回调 → `/auth/callback`（Route Handler）→ 用 code + code_verifier + client_secret 换 token
4. iron-session 存储 JWT（access_token + refresh_token）→ 设置 HTTP-only cookie
5. 后续请求 → `apiClient()` 自动从 session 读取 Bearer token → API 层 `toActor()` 识别 `admin` role
6. Token 过期前 60s 自动刷新（`api-fetch.ts` 中处理）

Admin Portal 和 Hospital Portal 使用同一 Keycloak realm，通过 realm role（`admin` vs `hospital`）区分权限。
auth 路由均为 Route Handler（`route.ts`），无独立登录 UI 页面。

---

## 七、实施分期

### Phase A — 核心骨架

**前置 API 任务（阻塞 A8）：**

| # | 任务 | 说明 |
|---|------|------|
| A0a | 扩展 `createHospitalSchema` 增加 `specialties` + `city` 字段 | 阻塞 New Hospital 一步创建 |
| A0b | 新增 BFF 路由 `GET /api/specialties` | 阻塞 New Hospital 专科选择 |
| A0c | 新增 `GET /api/v2/auth/hospital/register` (验证 token) | 阻塞 Hospital Registration 页面 |
| A0d | 新增 `POST /api/v2/auth/hospital/register` (创建用户) | 阻塞 Hospital Registration 页面 |
| A0e | `GenerateRegistrationTokenUseCase` 增加邮件发送逻辑 | 阻塞完整创建医院流程 |

**页面任务：**

| # | 任务 | 依赖 | API 就绪？ |
|---|------|------|-----------|
| A1 | Admin Shell（layout + 侧边栏 + 顶栏 + 认证集成） | 已有 auth 骨架 | ✅ |
| A2 | Dashboard 页面 | `GET /api/v2/admin/dashboard` | ✅ |
| A3 | Cases 列表页 | `GET /cases` + `GET /cases/stats` | ✅ |
| A4 | New Case 表单页（临时入口） | `POST /api/v2/cases` | ✅ |
| A5 | Case Detail（Overview + Medical Intake Tab） | `GET /cases/{id}` + `/documents` + `/questionnaire` | ✅ |
| A6 | Hospitals 列表页 | `GET /hospitals` | ✅ |
| A7 | Hospital Detail（基本信息 + 案例 + 宣传材料审核，无统计/无账号列表） | `GET /hospitals/{id}` + `/cases` + `PATCH /status` + `POST /registration-token` | ✅ |
| A8 | New Hospital 表单页（一步流程） | `POST /hospitals`（扩展后含 specialties + city） | ⚠️ 依赖 A0a + A0b |
| A9 | Hospital Registration 页面（公开页面，token 验证 + 注册表单） | `GET` + `POST /api/v2/auth/hospital/register` | ⚠️ 依赖 A0c + A0d + A0e |

### Phase B — 多医院工作流 + 扩展 Tab

**前置 API 任务（阻塞 B7）：**

| # | 任务 | 说明 |
|---|------|------|
| B0a | 扩展 `ticketListQuerySchema` 增加 `caseId` 过滤 | 阻塞 Support Tab |

**页面任务：**

| # | 任务 | 依赖 | API 就绪？ |
|---|------|------|-----------|
| B1 | Case Detail: Multi-Hospital Quotes Tab | `/hospital-contacts` + `/quotes/compare` | ✅ |
| B2 | Case Detail: Timeline Tab | `/cases/{id}/timeline` | ✅ |
| B3 | Case Detail: Messages Tab | `/conversations` + `/messages` | ✅ |
| B4 | Case Detail: Journey Tab | `/journey` + `/milestones` | ✅ |
| B5 | Case Detail: Consultations Tab | `/consultations` | ✅ |
| B6 | Case Detail: Orders Tab（只读） | `/orders?caseId=` | ✅ |
| B7 | Case Detail: Support Tab | `/tickets?caseId=` | ⚠️ 依赖 B0a |
| B8 | Case Detail: AI Summary Tab | `CaseDTO.aiSummary`（已有字段） | ✅ |

---

## 八、错误、加载与空状态处理

| 场景 | 处理方式 |
|------|----------|
| **API 请求失败** | Toast 通知显示错误信息 + 重试按钮（React Query `retry: 1`） |
| **页面级错误** | `app/error.tsx` 全局错误边界，显示友好提示 + 返回按钮 |
| **加载中** | `app/loading.tsx` 全局 loading + 各组件使用 Skeleton Loader（非 Spinner） |
| **列表为空** | 使用 `EmptyState` 组件，每个列表有专属文案（如"暂无案例"、"暂无医院"） |
| **Tab 内容加载** | 每个 Tab 独立 loading skeleton，切换 Tab 时 lazy load |

### 响应式设计

Admin Portal **以桌面端为主**（1280px+），侧边栏固定宽度。不做移动端适配，但确保 1024px 宽度下不出现布局错误（侧边栏可折叠）。

---

## 九、未来阶段（Phase C~E，本次不实现）

| Phase | 页面 | 说明 |
|-------|------|------|
| **C** | Messages 消息中心（独立页面） | 双栏聊天布局，Admin↔Patient / Admin↔Hospital / Hospital↔Patient（只读监控） |
| **D** | Orders 订单管理（独立列表页）、Packages 套餐管理、Support Tickets（独立列表页） | 独立页面 vs Case Detail 内的 Tab 子集 |
| **E** | Patient Detail、Settings、Create User、Admin Profile、Chatbot & FAQ、Question Collectors | 管理类 & 低优先级功能 |

这些页面的 API 大部分已就绪，待 Phase A+B 完成后按优先级推进。
