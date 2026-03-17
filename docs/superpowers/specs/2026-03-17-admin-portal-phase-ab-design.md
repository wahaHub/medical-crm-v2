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
- **Keycloak PKCE + iron-session** — 认证
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
│   │   └── [id]/page.tsx       # Case Detail（10 Tab）
│   └── hospitals/
│       ├── page.tsx            # Hospitals 列表
│       ├── new/page.tsx        # 创建 Hospital
│       └── [id]/page.tsx       # Hospital Detail
├── auth/                        # 已有骨架
│   ├── login/page.tsx
│   ├── callback/page.tsx
│   └── logout/route.ts
└── api/                         # BFF 代理路由
    └── [...proxy]/route.ts
```

**注意：无 `/cases/new` 路由。** Admin 不能创建 Case，Case 由 Patient booking 流程产生。

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
├── queries/                # React Query hooks
│   ├── use-cases.ts
│   ├── use-hospitals.ts
│   ├── use-conversations.ts
│   ├── use-consultations.ts
│   ├── use-orders.ts
│   ├── use-tickets.ts
│   └── use-dashboard.ts
├── actions/                # Server Actions
│   ├── hospital-actions.ts
│   └── case-actions.ts
└── lib/
    ├── api-client.ts       # 已有，复用 fetch + token refresh
    ├── api-types.ts        # Admin 专用 API 类型
    ├── auth-context.tsx
    ├── session.ts          # 已有
    └── query-provider.tsx
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

| 模块 | 内容 | 组件 |
|------|------|------|
| 统计卡片行 | 总案例 / 活跃案例 / 待报价案例 / 本月新增 | `StatCard` (shared/ui) |
| 最近案例 | 最新 5-10 条 Case：患者名、状态、阶段、创建时间 | `DataTable` (shared/ui) |
| 待办事项 | 待审核消息数 + 待回复报价数，可点击跳转 | 自定义 `TodoWidget` |

### 3.2 Cases 列表 (`/cases`)

**数据源**：`GET /api/v2/cases` + `GET /api/v2/cases/stats`

| 模块 | 内容 |
|------|------|
| 统计卡片 | 总数 / 活跃 / 已完成 / 待报价 |
| 筛选栏 | 搜索框 + 状态下拉 + 阶段下拉 + 日期范围 |
| 案例表格 | 患者名、状态 Badge、阶段、分配医院数、报价数、创建日期 |

**无 "新建案例" 按钮。**

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
| **宣传材料审核**（底部） | 见下方详细设计 |

#### 宣传材料审核区域（参照 v1）

- 医院状态 Badge：已审核（绿）/ 待审核（黄）/ 已停用（红）
- 审核操作按钮：
  - 状态为"待审核"时：显示 **"审核通过"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "active" }`
  - 状态为"已审核"时：显示 **"撤回审核"** 按钮 → `PATCH /hospitals/{id}/status` body: `{ status: "pending" }`
- 消费者网站链接预览（可点击打开）
- 状态变更会同步到对应 Supabase（COSMETIC → main Supabase `is_active`；REGULAR → china-medical `status`）

### 3.6 New Hospital (`/hospitals/new`)

**数据源**：`POST /api/v2/hospitals`

**表单字段：**

| 字段 | 必填 | 条件 | 说明 |
|------|------|------|------|
| 医院名称 | ✅ | — | text input |
| 医院类型 | ✅ | — | Radio: COSMETIC（整容医院）/ REGULAR（一般医院），切换影响颜色主题和后续字段 |
| 地址 | ✅ | — | text input |
| 城市 | ✅ | 仅 REGULAR | text input，COSMETIC 时隐藏 |
| 电话 | ❌ | — | text input，可选 |
| 邮箱 | ✅ | — | email input |
| 专科选择 | ✅ | 至少 1 个 | 多选 Badge，列表根据类型动态切换（见下方） |
| 描述 | ❌ | — | textarea |

**专科列表（根据医院类型动态切换）：**

| 类型 | 数据源 | 分类 |
|------|--------|------|
| **COSMETIC** | Main Supabase `procedures` 表 | 按 category 分组：Face（Rhinoplasty, Facelift, Blepharoplasty...）/ Body（Liposuction, BBL, Breast Augmentation...）/ Non-surgical（Botox, Fillers, Laser...） |
| **REGULAR** | China Medical Supabase `hospital_i18n.departments_info` | 科室列表：心脏科、肿瘤科、神经科、骨科、眼科、消化科、呼吸科、肝病科、肾内科、血液科、内分泌科、风湿免疫科、整形外科、泌尿外科、妇产科、儿科、皮肤科、耳鼻喉科 |

切换类型时重置已选专科。

**创建后逻辑：**
1. 调用 `POST /api/v2/hospitals`
2. 成功提示："医院创建成功！系统已向医院邮箱发送邀请链接"
3. 自动跳转到医院详情页 `/hospitals/{newId}`

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

### 4.2 缺失 API（前端空状态占位，后补）

| API | 用途 | 影响页面 |
|-----|------|----------|
| `GET /cases/{id}/ai-summary` | AI 案例摘要 | Case Detail → AI Summary Tab |
| `POST /cases/{id}/ai-summary/rebuild` | 重建 AI 摘要 | 同上 |

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

复用已有 `apps/admin/` 的 Keycloak PKCE 骨架：

1. 用户访问 Admin Portal → middleware 检查 `medical-crm-admin-session` cookie
2. 无 session → 重定向 `/auth/login` → Keycloak PKCE 授权
3. Callback 回来 → iron-session 存储 JWT → 设置 cookie
4. 后续请求 → `apiClient()` 自动附带 Bearer token → API 层 `toActor()` 识别 `admin` role
5. Token 过期前 60s 自动刷新

Admin Portal 和 Hospital Portal 使用同一 Keycloak realm，通过 realm role（`admin` vs `hospital`）区分权限。

---

## 七、实施分期

### Phase A — 核心骨架

| # | 任务 | 依赖 |
|---|------|------|
| A1 | Admin Shell（layout + 侧边栏 + 顶栏 + 认证集成） | 已有 auth 骨架 |
| A2 | Dashboard 页面 | `GET /admin/dashboard` |
| A3 | Cases 列表页 | `GET /cases` + `GET /cases/stats` |
| A4 | Case Detail（Overview + Medical Intake Tab） | `GET /cases/{id}` + `/documents` + `/questionnaire` |
| A5 | Hospitals 列表页 | `GET /hospitals` |
| A6 | Hospital Detail（基本信息 + 统计 + 案例 + 宣传材料审核） | `GET /hospitals/{id}` + `/cases` + `PATCH /status` |
| A7 | New Hospital 表单页 | `POST /hospitals` |

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
