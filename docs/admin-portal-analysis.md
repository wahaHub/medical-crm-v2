# Admin Portal 设计分析 & API 缺口报告

> 日期：2026-03-16
> 基于 v1 设计文档 + v2 已实现的 127 个 API 端点进行分析

---

## 一、Admin Portal 需要的页面总览

根据 v1 设计文档，Admin Portal 共 **13 个页面**：

| # | 页面 | 路由 | 核心功能 | 优先级 |
|---|------|------|----------|--------|
| 1 | Dashboard | `/admin` | 统计卡片、待办、最近案例/用户 | P0 |
| 2 | Cases 列表 | `/admin/cases` | 搜索/筛选、统计卡片、案例表格 | P0 |
| 3 | New Case | `/admin/cases/new` | 创建案例+文档上传+AI分析 | P1 |
| 4 | Case Detail | `/admin/cases/[id]` | 6 Tab（聊天/进度/医疗/问诊/邀请函/医院分配） | P0 |
| 5 | Assign Hospital | `/admin/cases/[id]/assign` | 选择医院分配 → **已改为多医院模式** | P0 |
| 6 | Hospitals 列表 | `/admin/hospitals` | 搜索/类型筛选、统计、医院表格 | P0 |
| 7 | New Hospital | `/admin/hospitals/new` | 创建医院表单 | P1 |
| 8 | Hospital Detail | `/admin/hospitals/[id]` | 基本信息、统计、关联案例、宣传材料审核 | P0 |
| 9 | Messages 消息中心 | `/admin/messages` | 独立布局、双栏聊天（医院+患者） | P0 |
| 10 | Settings | `/admin/settings` | 系统/安全/邮件/通知/数据库设置 | P2 |
| 11 | Admin Profile | `/admin/profile` | 个人信息、权限、安全设置 | P2 |
| 12 | Create User | `/admin/create-user` | 创建医生/销售顾问 | P2 |
| 13 | Patient Detail | `/admin/patients/[id]` | 行程管理/签证/医疗信息 | P1 |

### v2 新增页面（v1 设计文档 `admin-portal-spec.md` 补充）

| # | 页面 | 路由 | 核心功能 | 优先级 |
|---|------|------|----------|--------|
| 14 | Case Detail - Multi-Hospital Quotes | Tab | 多医院报价对比、提醒、移除 | P0 |
| 15 | Case Detail - Orders | Tab | 关联订单列表 | P1 |
| 16 | Case Detail - Support | Tab | 关联工单 | P1 |
| 17 | Case Detail - Journey | Tab | 签证/保险/住宿/交通/术后 | P1 |
| 18 | Case Detail - Timeline | Tab | 完整事件时间线 | P0 |
| 19 | Case Detail - AI Summary | Tab | AI 生成的案例摘要 | P1 |
| 20 | Case Detail - Medical Intake | Tab | 问卷回答（只读） | P1 |
| 21 | Packages 套餐管理 | `/admin/packages` | CRUD + 发布/下架 | P1 |
| 22 | Orders 订单管理 | `/admin/orders` | 列表 + 详情 + 退款 | P1 |
| 23 | Support Tickets | `/admin/support` | 工单管理 + SLA | P1 |
| 24 | Chatbot & FAQ | `/admin/chatbot` | FAQ 库 + 自动回复设置 | P2 |
| 25 | Question Collectors | `/admin/question-collectors` | 问卷模板管理 | P2 |

---

## 二、API 状态对比：已有 vs 缺失

### 2.1 已实现的 API（可直接用于 Admin Portal）

#### Cases（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateCase | POST | `/api/v2/cases` | ✅ |
| ListCases | GET | `/api/v2/cases` | ✅ |
| GetCaseStats | GET | `/api/v2/cases/stats` | ✅ |
| GetCase | GET | `/api/v2/cases/{id}` | ✅ |
| UpdateCase | PATCH | `/api/v2/cases/{id}` | ✅ |
| UpdateCaseStatus | PATCH | `/api/v2/cases/{id}/status` | ✅ |
| AdvanceCaseStage | PATCH | `/api/v2/cases/{id}/stage` | ✅ |

#### Hospital Contacts & Quotes（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| AddHospitalToCase | POST | `/api/v2/cases/{caseId}/hospital-contacts` | ✅ |
| ListCaseHospitalContacts | GET | `/api/v2/cases/{caseId}/hospital-contacts` | ✅ |
| RemoveHospitalFromCase | PATCH | `/api/v2/hospital-contacts/{id}/remove` | ✅ |
| SendReminder | POST | `/api/v2/hospital-contacts/{id}/remind` | ✅ |
| AdminResetAssignment | POST | `/api/v2/cases/{caseId}/reset-assignment` | ✅ |
| CreateQuote | POST | `/api/v2/quotes` | ✅ |
| ListQuotes | GET | `/api/v2/quotes` | ✅ |
| GetQuote | GET | `/api/v2/quotes/{id}` | ✅ |
| UpdateQuote | PATCH | `/api/v2/quotes/{id}` | ✅ |
| SendQuote | POST | `/api/v2/quotes/{id}/send` | ✅ |
| AcceptQuote | POST | `/api/v2/quotes/{id}/accept` | ✅ |
| RejectQuote | POST | `/api/v2/quotes/{id}/reject` | ✅ |
| ResendQuote | POST | `/api/v2/quotes/{id}/resend` | ✅ |
| CompareQuotes | GET | `/api/v2/cases/{caseId}/quotes/compare` | ✅ |

#### Hospitals（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateHospital | POST | `/api/v2/hospitals` | ✅ |
| ListHospitals | GET | `/api/v2/hospitals` | ✅ |
| GetHospital | GET | `/api/v2/hospitals/{id}` | ✅ |
| UpdateHospital | PUT | `/api/v2/hospitals/{id}` | ✅ |
| UpdateHospitalStatus | PATCH | `/api/v2/hospitals/{id}/status` | ✅ |
| GetHospitalCases | GET | `/api/v2/hospitals/{id}/cases` | ✅ |
| GenerateRegistrationToken | POST | `/api/v2/hospitals/{id}/registration-token` | ✅ |

#### Conversations & Messages（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateConversation | POST | `/api/v2/conversations` | ✅ |
| ListConversations | GET | `/api/v2/conversations` | ✅ |
| GetConversation | GET | `/api/v2/conversations/{id}` | ✅ |
| UpdateConversation | PUT | `/api/v2/conversations/{id}` | ✅ |
| ListMessages | GET | `/api/v2/conversations/{id}/messages` | ✅ |
| SendMessage | POST | `/api/v2/conversations/{id}/messages` | ✅ |
| GetMessage | GET | `/api/v2/conversations/{id}/messages/{msgId}` | ✅ |
| UpdateMessage | PUT | `/api/v2/conversations/{id}/messages/{msgId}` | ✅ |
| DeleteMessage | DELETE | `/api/v2/conversations/{id}/messages/{msgId}` | ✅ |
| RegenerateSummary | POST | `.../{msgId}/regenerate-summary` | ✅ |
| RetranslateMessage | POST | `.../{msgId}/retranslate` | ✅ |
| ListPendingReview | GET | `/api/v2/messages/pending-review` | ✅ |
| ApproveMessage | POST | `/api/v2/messages/{msgId}/approve` | ✅ |
| RejectMessage | POST | `/api/v2/messages/{msgId}/reject` | ✅ |

#### Consultations（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateConsultation | POST | `/api/v2/consultations` | ✅ |
| ListConsultations | GET | `/api/v2/consultations` | ✅ |
| GetConsultationStats | GET | `/api/v2/consultations/stats` | ✅ |
| GetConsultation | GET | `/api/v2/consultations/{id}` | ✅ |
| UpdateConsultation | PUT | `/api/v2/consultations/{id}` | ✅ |
| UpdateConsultationStatus | PATCH | `/api/v2/consultations/{id}/status` | ✅ |
| GetTranscript | GET | `/api/v2/consultations/{id}/transcript` | ✅ |
| ListCaseConsultations | GET | `/api/v2/cases/{caseId}/consultations` | ✅ |

#### Documents（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| UploadDocument | POST | `/api/v2/cases/{caseId}/documents` | ✅ |
| ListDocuments | GET | `/api/v2/cases/{caseId}/documents` | ✅ |
| DeleteDocument | DELETE | `/api/v2/cases/{caseId}/documents/{docId}` | ✅ |

#### Case Events & Timeline（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| ListCaseEvents | GET | `/api/v2/cases/{caseId}/events` | ✅ |
| GetCaseTimeline | GET | `/api/v2/cases/{caseId}/timeline` | ✅ |

#### Dashboard（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| AdminDashboard | GET | `/api/v2/admin/dashboard` | ✅ |

#### Packages（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreatePackage | POST | `/api/v2/packages` | ✅ |
| ListPackages | GET | `/api/v2/packages` | ✅ |
| GetPackage | GET | `/api/v2/packages/{id}` | ✅ |
| UpdatePackage | PUT | `/api/v2/packages/{id}` | ✅ |
| PublishPackage | POST | `/api/v2/packages/{id}/publish` | ✅ |
| UnpublishPackage | POST | `/api/v2/packages/{id}/unpublish` | ✅ |

#### Orders（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateOrder | POST | `/api/v2/orders` | ✅ |
| ListOrders | GET | `/api/v2/orders` | ✅ |
| GetOrder | GET | `/api/v2/orders/{id}` | ✅ |
| UpdateOrderStatus | PATCH | `/api/v2/orders/{id}/status` | ✅ |
| CreatePaymentIntent | POST | `/api/v2/orders/{id}/payment-intents` | ✅ |
| RequestRefund | POST | `/api/v2/orders/{id}/refunds` | ✅ |

#### Support Tickets（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateTicket | POST | `/api/v2/tickets` | ✅ |
| ListTickets | GET | `/api/v2/tickets` | ✅ |
| GetTicket | GET | `/api/v2/tickets/{id}` | ✅ |
| AssignTicket | POST | `/api/v2/tickets/{id}/assign` | ✅ |
| ReplyToTicket | POST | `/api/v2/tickets/{id}/reply` | ✅ |
| UpdateTicketStatus | PATCH | `/api/v2/tickets/{id}/status` | ✅ |
| CloseTicket | POST | `/api/v2/tickets/{id}/close` | ✅ |

#### Journey & Milestones（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| GetCaseJourney | GET | `/api/v2/cases/{caseId}/journey` | ✅ |
| UpdateCaseJourney | PUT | `/api/v2/cases/{caseId}/journey` | ✅ |
| ListMilestones | GET | `/api/v2/cases/{caseId}/milestones` | ✅ |
| CreateMilestone | POST | `/api/v2/cases/{caseId}/milestones` | ✅ |
| UpdateMilestone | PATCH | `/api/v2/cases/{caseId}/milestones/{id}` | ✅ |
| DeleteMilestone | DELETE | `/api/v2/cases/{caseId}/milestones/{id}` | ✅ |

#### Question Collector（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateTemplate | POST | `/api/v2/question-templates` | ✅ |
| ListTemplates | GET | `/api/v2/question-templates` | ✅ |
| GetTemplate | GET | `/api/v2/question-templates/{id}` | ✅ |
| UpdateTemplate | PUT | `/api/v2/question-templates/{id}` | ✅ |
| SubmitResponse | POST | `/api/v2/cases/{caseId}/questionnaire` | ✅ |
| SaveResponseDraft | PATCH | `/api/v2/cases/{caseId}/questionnaire` | ✅ |
| GetResponse | GET | `/api/v2/cases/{caseId}/questionnaire` | ✅ |
| ListResponses | GET | `/api/v2/questionnaire-responses` | ✅ |

#### Service Catalog & Quote Templates（完全就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| 6 service-catalog endpoints | CRUD | `/api/v2/...service-catalog...` | ✅ |
| 5 quote-template endpoints | CRUD | `/api/v2/...quote-templates...` | ✅ |

#### Public Booking（基本就绪 ✅）
| API | 方法 | 路径 | 状态 |
|-----|------|------|------|
| CreateBookingRequest | POST | `/api/v2/public/booking-requests` | ✅ |
| GetRecommendations | GET | `/api/v2/public/hospital-recommendations/{id}` | ✅ |
| SaveHospitalSelections | POST | `/api/v2/public/booking-requests/{id}/selections` | ✅ |
| CompleteSignup | POST | `/api/v2/public/booking-requests/{id}/complete-signup` | ⚠️ 路由存在但未实现 |

---

### 2.2 缺失的 API（需要新建）

| # | API | 方法 | 路径 | 用途 | 优先级 |
|---|-----|------|------|------|--------|
| 1 | CompleteSignup | POST | `/api/v2/public/booking-requests/{id}/complete-signup` | 患者完成注册、自动创建 Case | P0 |
| 2 | GetCaseAISummary | GET | `/api/v2/cases/{caseId}/ai-summary` | AI 案例摘要 | P1 |
| 3 | RebuildAISummary | POST | `/api/v2/cases/{caseId}/ai-summary/rebuild` | 重新生成 AI 摘要 | P1 |
| 4 | ChatbotFAQ CRUD | GET/POST/PATCH/DELETE | `/api/v2/chatbot/faqs[/{id}]` | FAQ 管理 | P2 |
| 5 | ChatbotAnalytics | GET | `/api/v2/chatbot/analytics` | FAQ 统计 | P2 |
| 6 | PackageAnalytics | GET | `/api/v2/packages/{id}/analytics` | 套餐数据分析 | P2 |
| 7 | QuestionTemplatePublish | PATCH | `/api/v2/question-templates/{id}/publish` | 发布/下架问卷模板 | P2 |
| 8 | ListUsers | GET | `/api/v2/users` | 用户列表（Dashboard 最近用户） | P1 |
| 9 | CreateUser | POST | `/api/v2/users` | 创建用户（医生/销售） | P1 |
| 10 | GetPatient | GET | `/api/v2/patients/{id}` | 患者详情 | P1 |
| 11 | OrderStats | GET | `/api/v2/orders/stats` | 订单统计卡片 | P1 |
| 12 | TicketStats | GET | `/api/v2/tickets/stats` | 工单统计卡片 | P1 |

### 2.3 缺口总结

```
已实现：  ~115 个 API 端点  ✅
缺失：    ~12 个 API 端点   ❌
半成品：  1 个（CompleteSignup）⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
覆盖率：  ~90%
```

**关键发现：Admin Portal 所需的核心 API 几乎全部就绪！**
缺失的主要是：
1. **CompleteSignup**（P0）— 完成患者注册闭环的关键
2. **用户管理** — ListUsers / CreateUser / GetPatient
3. **统计类** — OrderStats / TicketStats（可从现有 list API 聚合）
4. **AI 摘要** — 独立的摘要端点
5. **Chatbot FAQ** — 低优先级新功能

---

## 三、Admin Portal 设计方案

### 3.1 技术方案

直接在 `apps/admin/` 中构建（已有 Next.js 15 shell），复用 `apps/hospital/` 的架构模式：

```
apps/admin/
├── src/
│   ├── app/
│   │   ├── (portal)/          # 需要认证的页面
│   │   │   ├── layout.tsx     # AdminPortalShell（侧边栏+顶栏）
│   │   │   ├── page.tsx       # Dashboard
│   │   │   ├── cases/
│   │   │   │   ├── page.tsx           # Cases 列表
│   │   │   │   ├── new/page.tsx       # 创建 Case
│   │   │   │   └── [id]/page.tsx      # Case 详情 (多 Tab)
│   │   │   ├── hospitals/
│   │   │   │   ├── page.tsx           # 医院列表
│   │   │   │   ├── new/page.tsx       # 创建医院
│   │   │   │   └── [id]/page.tsx      # 医院详情
│   │   │   ├── messages/
│   │   │   │   └── page.tsx           # 消息中心 (独立布局)
│   │   │   ├── orders/
│   │   │   │   └── page.tsx           # 订单管理
│   │   │   ├── packages/
│   │   │   │   └── page.tsx           # 套餐管理
│   │   │   ├── support/
│   │   │   │   └── page.tsx           # 工单管理
│   │   │   ├── patients/
│   │   │   │   └── [id]/page.tsx      # 患者详情
│   │   │   └── settings/
│   │   │       └── page.tsx           # 设置
│   │   ├── auth/
│   │   │   ├── login/page.tsx
│   │   │   └── logout/page.tsx
│   │   └── api/                # BFF 代理路由
│   │       └── [...proxy]/route.ts
│   ├── components/             # Admin 专用组件
│   │   ├── admin-shell.tsx
│   │   ├── cases-list.tsx
│   │   ├── case-detail-tabs.tsx
│   │   ├── hospitals-list.tsx
│   │   ├── messages-view.tsx
│   │   ├── dashboard-widgets.tsx
│   │   └── ...
│   └── lib/
│       ├── api-client.ts       # 复用 hospital 的 fetch 封装
│       └── auth.ts             # Keycloak 认证
```

### 3.2 与 Hospital Portal 的复用

可以直接复用或改造的组件：
- `packages/shared/ui` — 基础 UI 组件
- **PortalShell** → AdminShell（同结构，不同菜单项）
- **Messages view** — 几乎一样，Admin 多一个「医院对话」分组
- **Cases list** — 相似结构，Admin 多了 multi-hospital 状态列
- **Consultation booking** — 共享组件
- **Invitation letter upload** — 共享组件
- **api-client / auth / middleware** — 完全复用

### 3.3 实施分期

#### Phase A — 核心骨架 (1-2 周)
1. Admin shell（layout + 侧边栏 + 认证）
2. Dashboard 页面
3. Cases 列表 + Case 详情（基础 Tab）
4. Hospitals 列表 + Hospital 详情

#### Phase B — 多医院工作流 (1 周)
5. Case Detail: Multi-Hospital Quotes Tab
6. Case Detail: Timeline Tab
7. Assign/管理医院联系人

#### Phase C — 消息 & 沟通 (1 周)
8. Messages 消息中心
9. Case Detail: Messages Tab

#### Phase D — 辅助功能 (1-2 周)
10. Orders 订单管理
11. Packages 套餐管理
12. Support Tickets 工单管理
13. Case Detail: Journey / AI Summary / Medical Intake

#### Phase E — 管理 & 设置 (1 周)
14. Patient Detail 页面
15. Settings 页面
16. Create User 页面
17. Chatbot & FAQ（如需要）

---

## 四、Patient Workflow 端到端测试方案

### 4.1 完整的患者流程

```
┌─────────────────────────────────────────────────────────┐
│                    Patient Journey                        │
│                                                           │
│  1. Booking Request    ──→  CreateBookingRequest (PUBLIC) │
│  2. Hospital Reco      ──→  GetHospitalRecommendations   │
│  3. Select Hospitals   ──→  SaveHospitalSelections       │
│  4. Complete Signup    ──→  CompleteSignup ⚠️ 未实现      │
│  5. Case Created       ──→  Case auto-created            │
│  6. Hospitals Added    ──→  AddHospitalToCase (auto)     │
│  7. Questionnaire      ──→  SubmitQuestionnaireResponse  │
│  8. Hospital Response  ──→  CreateQuote (hospital)       │
│  9. Quote Sent         ──→  SendQuote (hospital)         │
│ 10. Compare Quotes     ──→  CompareQuotes (patient)      │
│ 11. Accept Quote       ──→  AcceptQuote (patient)        │
│     → Case: UNASSIGNED → ASSIGNED                        │
│ 12. Treatment Stage    ──→  AdvanceCaseStage             │
│ 13. Journey Setup      ──→  UpdateCaseJourney            │
│ 14. Messages           ──→  SendMessage                  │
│ 15. Consultation       ──→  CreateConsultation           │
│ 16. Order              ──→  CreateOrder                  │
│ 17. Completion         ──→  AdvanceCaseStage(COMPLETED)  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 可以立即用现有 API 测试的流程

由于 `CompleteSignup` 未实现，我们可以绕过它，直接从步骤 5 开始：

#### 测试方案 A：Admin 手动创建 Case（模拟已注册患者）

```bash
# 步骤 1: 创建医院
POST /api/v2/hospitals
Body: { name: "Test Hospital A", type: "COSMETIC", ... }

# 步骤 2: 创建另一个医院
POST /api/v2/hospitals
Body: { name: "Test Hospital B", type: "REGULAR", ... }

# 步骤 3: 创建 Case
POST /api/v2/cases
Body: { patientName: "张三", primaryDiagnosis: "...", ... }

# 步骤 4: 添加医院联系人（模拟患者选择了 2 家医院）
POST /api/v2/cases/{caseId}/hospital-contacts
Body: { hospitalId: "hospital-a-id" }

POST /api/v2/cases/{caseId}/hospital-contacts
Body: { hospitalId: "hospital-b-id" }

# 步骤 5: 上传文档
POST /api/v2/cases/{caseId}/documents
Body: FormData { file, type: "medical_record" }

# 步骤 6: 医院 A 创建报价
POST /api/v2/quotes
Body: { caseId, hospitalId: "hospital-a-id", items: [...], totalAmount: 50000 }

# 步骤 7: 医院 A 发送报价
POST /api/v2/quotes/{quoteAId}/send

# 步骤 8: 医院 B 也创建并发送报价
POST /api/v2/quotes
POST /api/v2/quotes/{quoteBId}/send

# 步骤 9: 对比报价
GET /api/v2/cases/{caseId}/quotes/compare

# 步骤 10: 患者接受医院 A 的报价
POST /api/v2/quotes/{quoteAId}/accept
# → Case 自动变为 ASSIGNED

# 步骤 11: 推进治疗阶段
PATCH /api/v2/cases/{caseId}/stage
Body: { stage: "IN_TREATMENT" }

# 步骤 12: 创建消息对话
POST /api/v2/conversations
Body: { caseId, type: "HOSPITAL_PATIENT", hospitalId: "hospital-a-id" }

# 步骤 13: 发送消息
POST /api/v2/conversations/{convId}/messages
Body: { content: "你好，我想了解治疗细节", senderRole: "patient" }

# 步骤 14: 预约问诊
POST /api/v2/consultations
Body: { caseId, hospitalId, scheduledAt: "...", durationMinutes: 30 }

# 步骤 15: 更新行程
PUT /api/v2/cases/{caseId}/journey
Body: { visa: {...}, accommodation: {...}, transportation: {...} }

# 步骤 16: 创建里程碑
POST /api/v2/cases/{caseId}/milestones
Body: { title: "签证通过", category: "visa", status: "completed" }

# 步骤 17: 创建订单
POST /api/v2/orders
Body: { caseId, packageId, totalAmount: 50000 }

# 步骤 18: 查看时间线
GET /api/v2/cases/{caseId}/timeline
```

#### 测试方案 B：从 Public Booking 开始（尽可能完整）

```bash
# 步骤 1: 创建预约请求
POST /api/v2/public/booking-requests
Body: {
  name: "Test Patient",
  email: "test@example.com",
  phone: "+1234567890",
  condition: "需要整形手术",
  preferredCountry: "CN"
}

# 步骤 2: 获取推荐医院
GET /api/v2/public/hospital-recommendations/{bookingId}

# 步骤 3: 保存医院选择
POST /api/v2/public/booking-requests/{bookingId}/selections
Body: { hospitalIds: ["hospital-a-id", "hospital-b-id"] }

# 步骤 4: ⚠️ CompleteSignup 未实现
# → 绕过方案：手动创建 Case + AddHospitalToCase

# 步骤 5-18: 同方案 A 的步骤 3-18
```

### 4.3 测试脚本建议

建议创建一个 **seed script** (`scripts/seed-patient-workflow.ts`)，自动执行上述步骤，生成一套完整的测试数据：

```typescript
// scripts/seed-patient-workflow.ts
// 使用已有的 API 客户端，按顺序调用所有 API
// 最终输出所有创建的 entity ID，便于在 Admin Portal 中查看

async function seedPatientWorkflow() {
  // 1. 确保有测试医院
  // 2. 创建 Case
  // 3. 添加 hospital contacts
  // 4. 创建 & 发送多个 quotes
  // 5. 接受一个 quote
  // 6. 推进 stage
  // 7. 创建 conversations + messages
  // 8. 创建 consultations
  // 9. 设置 journey + milestones
  // 10. 创建 orders
  // → 输出完整的 ID 映射表
}
```

---

## 五、需要讨论的设计决策

### 5.1 `CompleteSignup` 的实现方案

这是唯一阻塞完整患者流程的 API。需要决定：

- **Option A**: 简单实现 — 在 Keycloak 创建用户 + 创建 Case + 添加 hospital-contacts
- **Option B**: 与现有注册流程对接 — 复用 `RegisterHospitalUser` 的模式
- **Option C**: 暂时跳过 — Admin 手动创建 Case（适合 MVP 阶段）

### 5.2 Admin Portal 的认证流程

目前 Hospital Portal 使用 Keycloak PKCE，Admin Portal 应该：
- 复用同一个 Keycloak realm，通过 role 区分（`platform_admin`）
- 登录页分开（`apps/admin/auth/login`），但 Keycloak client 可以相同或分开

### 5.3 Admin 消息中心的特殊需求

Admin 能看到：
- Admin ↔ Patient 对话（直接参与）
- Admin ↔ Hospital 对话（直接参与）
- Hospital ↔ Patient 对话（**只读监控**）

需要确认：现有 `ListConversations` API 是否支持按 role 过滤？Admin 能否通过 API 查看 Hospital↔Patient 的消息？

### 5.4 Admin 与 Hospital Portal 的组件共享策略

两种方案：
- **方案 A**: 把共享组件提到 `packages/shared/ui`
- **方案 B**: 直接在 Admin 中重写（更灵活，但重复代码）
- **建议**: 基础组件（Shell, DataTable, Forms）共享，业务组件各自实现

### 5.5 Case Detail 的 Tab 数量

v1 有 6 个 Tab，v2 spec 扩展到 9 个 Tab。建议：
- P0 先做 5 个核心 Tab：Overview, Multi-Hospital Quotes, Timeline, Messages, Medical Intake
- P1 再加 Journey, AI Summary, Orders, Support

---

## 六、结论

### 乐观的发现
- **API 覆盖率 ~90%**，核心业务流程的 API 全部就绪
- Hospital Portal 的架构可以直接复用
- 多医院报价对比（核心创新点）的 API 完整

### 需要行动的事项
1. **实现 CompleteSignup**（或决定暂时跳过）
2. **补充统计 API**（OrderStats, TicketStats）
3. **编写 seed 脚本**测试完整流程
4. **开始 Admin Portal Phase A**（骨架 + Dashboard + Cases + Hospitals）
5. **修复 Phase 2BC Codex review 发现的问题**（composition-root、race condition、retry logic）

---

*本文档将随讨论更新。*
