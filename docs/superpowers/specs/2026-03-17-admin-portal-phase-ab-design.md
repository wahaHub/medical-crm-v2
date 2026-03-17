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
| 缺失 API | 前端先行，API 后补 | 核心 API 全就绪，缺失的为辅助统计类 |
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
| 统计卡片 | 总数 / 活跃 / 已完成 / 待报价 |
| 筛选栏 | 搜索框 + 状态下拉 + 阶段下拉 + 日期范围 |
| 案例表格 | 患者名、状态 Badge、阶段、分配医院数、报价数、创建日期 |

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
| 8 | **Orders** | `GET /orders?caseId={id}` | 关联订单列表 + 状态 + 退款操作按钮 |
| 9 | **Support** | `GET /tickets?caseId={id}` | 关联工单列表 + 回复 + 状态管理 |
| 10 | **AI Summary** | `GET /cases/{caseId}/ai-summary` ⚠️ | AI 案例摘要（API 缺失，前端空状态占位） |

**Tab 实现策略**：使用 `@medical-crm/ui` 的 `Tabs` 组件，每个 Tab 内容为独立 Client Component，各自管理 React Query 数据获取（lazy load，切换到该 Tab 时才请求）。

### 3.4 Hospitals 列表 (`/hospitals`)

**数据源**：`GET /api/v2/hospitals`

| 模块 | 内容 |
|------|------|
| 筛选栏 | 搜索框 + 类型筛选（COSMETIC / REGULAR）+ 状态筛选（已审核/待审核/已停用） |
| 医院表格 | 名称、类型 Badge、状态 Badge、关联案例数、创建日期 |
| 操作 | "新建医院" 按钮 → `/hospitals/new` |

### 3.5 Hospital Detail (`/hospitals/[id]`)

**数据源**：`GET /api/v2/hospitals/{id}` + `GET /api/v2/hospitals/{id}/cases`

| 模块 | 内容 |
|------|------|
| **基本信息卡片** | 名称、类型 Badge、地址、电话、邮箱、描述 |
| **专科标签** | 医院擅长专科，Badge 展示 |
| **统计卡片** | 关联案例数 / 活跃案例 / 已完成案例 |
| **医院账号列表** | 该医院的用户账号、角色、最后登录时间 |
| **关联案例表格** | 最近 10 条案例（复用 DataTable） |
| **邀请链接管理** | "生成邀请链接" 按钮 → 弹出邮箱确认框 → `POST /hospitals/{id}/registration-token` body: `{ email }` |
| **宣传材料审核**（底部） | 见下方详细设计 |

#### 宣传材料审核区域（参照 v1）

- 医院状态 Badge：已审核（绿）/ 待审核（黄）/ 已停用（红）
- 审核操作按钮（枚举值为大写，与 `hospitalStatusSchema` 一致）：
  - 状态为 `PENDING` 时：显示 **"审核通过"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "ACTIVE" }`
  - 状态为 `ACTIVE` 时：显示 **"撤回审核"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "PENDING" }`
  - 额外：显示 **"停用医院"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "INACTIVE" }`（需二次确认弹窗）
  - 状态为 `INACTIVE` 时：显示 **"重新启用"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "PENDING" }`
- 消费者网站链接预览（可点击打开）
- 状态变更会同步到对应 Supabase（COSMETIC → main Supabase `is_active`；REGULAR → china-medical `status`）

### 3.6 New Hospital (`/hospitals/new`)

**数据源**：`POST /api/v2/hospitals`

**两步流程：** 创建医院是一个两步操作，因为 `POST /api/v2/hospitals` 的 schema 只接受基础字段（`name`, `type`, `contactEmail`, `contactPhone`, `address`, `description`），城市和专科需要在创建后通过 `PUT /api/v2/hospitals/{id}` 补充。

#### Step 1: 基础信息表单

| 字段 | 必填 | 条件 | API 字段名 |
|------|------|------|-----------|
| 医院名称 | ✅ | — | `name` |
| 医院类型 | ✅ | — | `type`: `COSMETIC` / `REGULAR` |
| 地址 | ❌ | — | `address` |
| 电话 | ❌ | — | `contactPhone` |
| 邮箱 | ✅ | — | `contactEmail`（schema 要求 `z.string().email()`） |
| 描述 | ❌ | — | `description` |

提交 → `POST /api/v2/hospitals` → 得到 `hospitalId`

#### Step 2: 补充信息（自动接续）

创建成功后，表单继续展示以下字段（或自动跳转到编辑页面）：

| 字段 | 必填 | 条件 | API 字段名 | 说明 |
|------|------|------|-----------|------|
| 专科选择 | ✅ | 至少 1 个 | `specialties` (string[]) | 多选 Badge，列表根据类型动态切换（见下方） |

提交 → `PUT /api/v2/hospitals/{id}` → 更新专科

**⚠️ 城市字段缺口：** `updateHospitalSchema` 当前不包含 `city` 字段（仅接受 `name`, `nameEn`, `address`, `phone`, `email`, `description`, `logoUrl`, `specialties`）。REGULAR 医院的城市信息需要通过 Supabase 同步层处理，或需扩展 `updateHospitalSchema` 增加 `city` 字段。**此为 API 缺口，Phase A 实现时需先补充。**

**专科列表（根据医院类型动态切换）：**

| 类型 | 数据源 | 分类 |
|------|--------|------|
| **COSMETIC** | Main Supabase `procedures` 表 | 按 category 分组：Face（Rhinoplasty, Facelift, Blepharoplasty...）/ Body（Liposuction, BBL, Breast Augmentation...）/ Non-surgical（Botox, Fillers, Laser...） |
| **REGULAR** | China Medical Supabase `hospital_i18n.departments_info` | 科室列表：心脏科、肿瘤科、神经科、骨科、眼科、消化科、呼吸科、肝病科、肾内科、血液科、内分泌科、风湿免疫科、整形外科、泌尿外科、妇产科、儿科、皮肤科、耳鼻喉科 |

切换类型时重置已选专科。

#### Step 3: 生成邀请链接（手动触发）

创建完成后，在 Hospital Detail 页面手动点击 **"生成邀请链接"** 按钮：
- 弹出输入框让用户确认/输入医院邮箱（默认填充创建时的 `contactEmail`）
- 调用 `POST /api/v2/hospitals/{id}/registration-token` body: `{ email: "hospital@example.com" }`（`generateRegistrationTokenSchema` 要求 `email` 字段）
- 生成 72 小时有效的注册令牌
- 系统发送邀请邮件到指定邮箱

**注意：邀请邮件不是创建时自动发送的，是独立的手动步骤。**

**创建后逻辑：**
1. `POST /api/v2/hospitals` → 创建基础信息
2. `PUT /api/v2/hospitals/{id}` → 补充城市/专科
3. 成功提示："医院创建成功！请在详情页生成邀请链接。"
4. 自动跳转到医院详情页 `/hospitals/{newId}`

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
| `updateHospitalSchema` 增加 `city` 字段 | Schema 扩展 | REGULAR 医院创建时设置城市 | New Hospital Step 2 | **P0（阻塞 New Hospital）** |
| `GET /cases/{id}/ai-summary` | 新 API | AI 案例摘要 | Case Detail → AI Summary Tab | P1（空状态占位） |
| `POST /cases/{id}/ai-summary/rebuild` | 新 API | 重建 AI 摘要 | 同上 | P1 |

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
| `cases-list.tsx` | 多了 multi-hospital 状态列、无新建按钮 |
| `case-detail-tabs.tsx` | 10 Tab vs Hospital 的简单视图 |
| `hospitals-list.tsx` | 有审核状态筛选 |
| `hospital-detail.tsx` | 有宣传材料审核区域 |
| `hospital-review.tsx` | 审核操作逻辑 |
| `new-hospital-form.tsx` | 双类型表单 + 动态专科列表 |
| `dashboard-widgets.tsx` | Admin 特有统计 |
| `quote-comparison.tsx` | 多医院报价对比表 |
| `timeline-view.tsx` | 垂直时间轴 |

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

| # | 任务 | 依赖 |
|---|------|------|
| A1 | Admin Shell（layout + 侧边栏 + 顶栏 + 认证集成） | 已有 auth 骨架 |
| A2 | Dashboard 页面 | `GET /api/v2/admin/dashboard` |
| A3 | Cases 列表页 | `GET /cases` + `GET /cases/stats` |
| A4 | New Case 表单页（临时入口） | `POST /api/v2/cases` |
| A5 | Case Detail（Overview + Medical Intake Tab） | `GET /cases/{id}` + `/documents` + `/questionnaire` |
| A6 | Hospitals 列表页 | `GET /hospitals` |
| A7 | Hospital Detail（基本信息 + 统计 + 案例 + 邀请链接 + 宣传材料审核） | `GET /hospitals/{id}` + `/cases` + `PATCH /status` + `POST /registration-token` |
| A8 | New Hospital 表单页（两步流程） | `POST /hospitals` + `PUT /hospitals/{id}` |

### Phase B — 多医院工作流 + 扩展 Tab

| # | 任务 | 依赖 |
|---|------|------|
| B1 | Case Detail: Multi-Hospital Quotes Tab | `/hospital-contacts` + `/quotes/compare` |
| B2 | Case Detail: Timeline Tab | `/cases/{id}/timeline` |
| B3 | Case Detail: Messages Tab | `/conversations` + `/messages` |
| B4 | Case Detail: Journey Tab | `/journey` + `/milestones` |
| B5 | Case Detail: Consultations Tab | `/consultations` |
| B6 | Case Detail: Orders Tab | `/orders?caseId=` |
| B7 | Case Detail: Support Tab | `/tickets?caseId=` |
| B8 | Case Detail: AI Summary Tab（空状态占位） | API 缺失，占位 |

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
