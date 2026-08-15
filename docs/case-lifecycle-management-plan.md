# 患者 Case 全生命周期管理 设计方案

> 版本：v1.1（2026-08-14）
> 状态：**Phase 1 已批准实施**；Phase 2–4 待评审。WhatsApp 集成与 AI 对话分析（P4a/P4b）降级为**可选项**，暂不实施。
> 核心约束：**不影响现有任何流程**——所有能力均为增量添加，现有 chatbot onboarding、case 创建、stage 流转、文档上传等行为保持不变。

---

## 1. 背景与目标

目前患者只能通过网站 chatbot/onboarding 流程自动建立 case。实际业务中：

- 患者可能先通过**邮件、WhatsApp、电话**等渠道咨询，系统中没有对应 case；
- 同一患者可能用**不同名字/联系方式**多次咨询，产生多个患者档案和多个 case，需要合并；
- 管理员需要**手动上传各类材料、手动更新就医进度**、记录线下沟通；
- 缺少一个**总览所有患者就医进度**的管理页面。

目标：以 `cases` 为唯一主干，让任意渠道来的患者都能纳入 case 管理，且 case 全生命周期可被人工维护。

## 2. 现状关键事实（设计依据）

| 事实 | 位置 |
|---|---|
| `cases` 已是核心域模型，子资源齐全：documents / conversations / consultations / quotes / case_events / journeys / orders | `packages/infrastructure/database/schema/schema.ts:141` |
| Phase 2 进度语义：`assignmentStatus` + `treatmentStage`；旧的 `status/stage` 已 deprecated | `packages/domain/src/entities/case.entity.ts:56-59` |
| 状态机已存在且只能前进：`STAGE_ORDER`、`treatment-stage-transitions.ts` | `packages/domain/src/state-machine/` |
| 每次 stage 流转已写 `case_progress` + `case_events`（25 种事件类型） | `packages/application/src/use-cases/cases/advance-case-stage.use-case.ts` |
| 后端 `PATCH /api/v2/cases/:id/stage` 已实现，前端 Server Action `updateCaseStage` / `updateCaseStatus` 已定义但**无调用方** | `apps/admin/src/actions/case-actions.ts:21,36` |
| 材料上传已完整：presigned URL → `documents` 表，admin Overview 的 DocumentsCard 支持上传/预览/删除 | `apps/api/src/routes/documents.routes.ts:372`、`tabs/case-overview-tab.tsx:725` |
| 患者 = `users` 表 `role='PATIENT'` 的行；email+site 部分唯一索引；**无 whatsapp 列、无合并逻辑** | `schema.ts:74-106` |
| 入站邮件已有基础设施：`inbound_email_events`、`email_reply_tokens` | `schema.ts:352,395` |
| admin 前端：Next.js 15 App Router，侧边栏 `NAV_ITEMS` 定义于 `admin-shell.tsx:9-21` | `apps/admin/src/components/admin-shell.tsx` |

## 3. 总体设计原则

1. **增量添加，不改现有行为**：新增枚举值、新字段（可空）、新路由、新页面；不修改任何现有用例的执行路径。现有 onboarding → case 创建 → stage 流转的链路代码零改动。
2. **业务规则只进 domain 层**：阶段流转校验全部走现有状态机；路由层不写逻辑（符合项目分层约定）。
3. **合并操作软标记、可回溯**：被合并的 patient/case 不物理删除，标记 `mergedInto*`，全程写 `case_events` + `audit_logs`。
4. **分四期交付**，每期独立可上线、可回滚。

---

## 4. Phase 1 — 手动建 Case + 生命周期管理页面 + 进度维护

> 目标：站外渠道患者能建档；管理员有一个总览页面维护所有 case 的进度；材料可按阶段归档；线下沟通可记录。
> 本 phase 交付后即解决"手动创建、上传材料、更新进度"三个日常需求。

### 4.1 手动创建 Case

**Schema 变更（增量、可空，不影响现有数据）**：
- `users.email` 对 PATIENT 允许为空（现唯一索引已是部分索引，调整为"email 非空时唯一"）；无 email 的患者后续可通过合并归并到正式档案。
- `users` 新增可空列 `whatsapp`（text）。
- `cases` 新增可空列：`source_channel`（枚举：`WEB_ONBOARDING / MANUAL / EMAIL / WHATSAPP / PHONE_CALL / REFERRAL`，现有 case 回填 `WEB_ONBOARDING`）、`created_by_admin_id`（可空，网站流程创建的为 NULL）。

**新增用例**：`create-manual-case.use-case.ts`
- 输入：姓名 + 至少一种联系方式（email/phone/whatsapp 三选一）+ 来源渠道 + 初步病情描述（可选）。
- 逻辑：若 email 命中现有患者则复用（走现有 `createTempPatient` 的冲突复用逻辑，避免重复建档）；否则创建无密码的临时 patient，再建 case（初始 `PENDING_ASSIGNMENT`）。
- 写 `case_events`（`CASE_CREATED`，source=MANUAL）+ `audit_logs`。

**API**：`POST /api/v2/cases/manual`（admin 角色，zod-openapi，与现有路由同构）。

**前端**：改造 `apps/admin/src/app/(portal)/cases/new/page.tsx`，增加"来源渠道"选择和联系方式三选一校验。

### 4.2 生命周期总览页面（新顶级栏目）

- 侧边栏新增 **Lifecycle** 入口（`admin-shell.tsx` 的 `NAV_ITEMS` + `getActiveKey`）。
- 新页面 `app/(portal)/lifecycle/page.tsx`：**看板视图**，按 `treatmentStage` 分列（CONFIRMED → IN_TREATMENT → POST_TREATMENT → COMPLETED → FOLLOW_UP），卡片显示患者名、caseNumber、医院、当前阶段停留天数、最近事件时间；支持按医院/站点过滤、搜索。
- 数据来源：复用现有 cases 列表查询（新增按 stage 分组参数，不改动现有接口默认行为）。

### 4.3 进度推进 UI（接通已有能力）

- Case 详情页 Overview 顶部加**进度步进器**：展示各阶段及完成时间戳（数据来自 `case_progress`，已有）。
- "推进阶段"按钮 → 接通**已存在但闲置**的 `updateCaseStage` / `updateCaseStatus` Server Action；非法流转被状态机拒绝时前端展示原因。
- 如需回退：新增 admin 专用 `force` 参数 + 必填原因，写 `case_events`（记录原因）。（默认不提供，评审后决定是否开放）

### 4.4 材料按阶段归档 + 线下沟通记录

- `documents` 新增可空列 `stage_tag`（text），上传时可标注所属阶段；Timeline/Overview 可按阶段过滤。**不传时行为与现在完全一致。**
- 新增 `POST /api/v2/cases/:id/notes`：管理员手动录入一条备注/线下沟通记录（电话、微信摘要等），写为 `case_events`（新事件类型 `ADMIN_NOTE`），出现在 Timeline tab。
- `case_events` 事件枚举新增值（纯追加）：`ADMIN_NOTE`、`CASE_MERGED`、`PATIENT_MERGED`。

### 4.5 Phase 1 改动清单

| 层 | 文件 |
|---|---|
| schema | `schema.ts`（users.whatsapp、cases.source_channel/created_by_admin_id、documents.stage_tag）+ 新 migration |
| domain | enums（SourceChannel、新事件类型）、无状态机改动 |
| application | `create-manual-case.use-case.ts`、`add-case-note.use-case.ts`（新增，不动现有用例） |
| api | `cases.routes.ts` 加 2 个端点、`composition-root.ts` 注册 |
| admin | `admin-shell.tsx`、`lifecycle/page.tsx` + 看板组件、`cases/new` 表单、Overview 步进器 + 阶段推进按钮、`use-media-upload` 加 stageTag |

**对现有流程的影响评估**：零。全部为新增列（可空）、新增端点、新增页面；现有 chatbot/onboarding/上传链路代码路径不变。

---

## 5. Phase 2 — 患者合并 + Case 合并

> 目标：同一患者多个档案/多个 case 可安全合并，全程可审计、可回溯。
> 依赖 Phase 1（手动建 case 后更需要合并）；本身独立可排期。

### 5.1 患者合并 `POST /api/v2/patients/{id}/merge`

- 指定 `primaryPatientId` 与 `secondaryPatientId`。
- 事务内执行：
  1. secondary 名下所有 cases 的 `patientId` 改挂 primary；
  2. 联系方式取并集（email/phone 以 primary 为准，secondary 的追加到 note；whatsapp 补齐空位）；
  3. secondary 标记 `merged_into_user_id` + 状态 MERGED，禁止登录（Keycloak 侧 disable 对应账号）；
  4. 写 `audit_logs`（操作人、双方 id、快照）+ 每个被转移 case 的 `case_events`（`PATIENT_MERGED`）。
- 合并前提供 **dry-run 预览**（`?dryRun=1`）：返回将被转移的 case 列表和字段冲突，前端确认后才执行。

### 5.2 Case 合并 `POST /api/v2/cases/{id}/merge`

- 指定 `primaryCaseId` 与 `secondaryCaseId`（通常属于同一患者；若属于不同患者，提示先做患者合并或显式确认）。
- 事务内把 secondary 的全部子资源 `caseId` 重指向 primary：documents、conversations/messages、consultations、quotes、case_events（保留原事件，追加标注）、orders、journey_milestones、support_tickets。
- secondary 标记 `merged_into_case_id` + status 新增枚举值 `MERGED`，默认从列表/看板过滤（可加筛选查看）。
- 写 primary 的 `case_events`（`CASE_MERGED`，记录来源 caseNumber）+ `audit_logs`。

### 5.3 前端

- Case 详情页加 **"Merge into…"** 操作：弹窗按患者名 / caseNumber / 联系方式搜索目标 case，展示双方摘要 + dry-run 预览，确认后执行。
- 患者维度（如做患者列表页）同样提供合并入口。

### 5.4 可靠性要点

- 全部合并操作单事务，失败整体回滚；
- secondary 记录软标记不删除，随时可追溯；
- `MERGED` 状态的 case/patient 在所有现有查询中默认排除（通过新过滤条件追加，不改变现有查询的默认结果集——`MERGED` 只由合并产生，现有数据无此状态）。

**对现有流程的影响评估**：零。不合并时系统行为与现在完全一致。

---

## 6. Phase 3 — 入站邮件自动归集 + 待认领收件箱

> 目标：患者直接发邮件来时，能自动或半自动归入 case。
> 依赖 Phase 1（"转为新 case"复用手动创建逻辑）。

1. **匹配规则**：入站邮件（现有 `inbound_email_events` 管道）按发件人 email 匹配 patient → 其活跃 case；匹配成功则自动生成 message/case event 挂到该 case 的 Timeline。
2. **待认领收件箱**：匹配失败的邮件进入新页面 "Inbox"（待认领列表），管理员可：
   - 一键**转为新 case**（调用 Phase 1 的手动创建用例，邮件内容作为初始记录）；
   - 或**挂到现有 case**（搜索选择）。
3. 患者在 case 中登记的渠道信息（`structuredData.channels`）作为匹配的辅助依据。

**对现有流程的影响评估**：仅在现有入站邮件处理管道末尾追加"匹配/入待认领"步骤；现有 email_reply_tokens 回邮流程不变。

---

## 7. Phase 4 — WhatsApp 集成 + AI 对话分析

> 目标：WhatsApp 消息像邮件一样归入 case；并由 AI 分析对话内容，自动推导每个 case 的最新状态供管理员确认。
> 拆为 P4a（消息管道）和 P4b（AI 状态推导）两小步，可独立上线。

### 7.1 P4a — WhatsApp Business Cloud API 消息管道

**接入方式**：Meta 官方 WhatsApp Business Platform（Cloud API）。
**不使用**个人号 + Web 协议自动化方案（违反 Meta 条款，有封号丢数据风险，医疗业务不可接受）。

前置条件：
- Meta 企业认证（营业执照等，审核数天到数周）；
- 一个专用电话号码（接入 Cloud API 后不能再登录普通 WhatsApp 客户端）；
- 患者 opt-in（首次联系时取得同意，隐私政策覆盖）。

关键限制：
- **24 小时会话窗口**：患者最后一条消息后 24 小时内可自由回复；超出窗口只能发送 Meta 预审通过的**模板消息**；
- 按消息计费（费率因国家/消息类型而异），也可通过 BSP（Twilio、360dialog 等）接入以省运维，多一层费用。

管道逻辑：
1. Cloud API webhook 接收入站消息 → 落库；
2. 按 `users.whatsapp`（Phase 1 新增列）匹配 patient/case，匹配逻辑与 Phase 3 邮件完全一致：匹配 → 挂靠到 case 时间线；未匹配 → 待认领收件箱 → 转 case；
3. 出站回复（管理员在 Messages 中直接回 WhatsApp，窗口外自动走模板）为可选项，视业务量决定。

### 7.2 P4b — AI 对话分析与状态推导

在消息管道之上增加分析层：

```
入站消息落库（挂到 case）
  → LLM 分析（输入：该 case 当前 stage、近期消息、已有病历摘要）
  → 结构化输出：
      - 建议的阶段变更 + 置信度 + 依据引用（指向具体消息）
      - 关键事实提取（手术日期、行程日期、医嘱、新症状）
      - 风险信号（投诉倾向、术后异常）→ 即时提醒管理员
      - 待办识别（患者承诺发报告但未发等）
  → 管理员在 case 时间线看到「AI 建议」卡片，一键确认 / 拒绝
  → 确认后走现有 domain 状态机流转，写 case_events（标注来源为 AI 建议 + 确认人）
```

必须守住的边界：

1. **建议制，不自动改 stage**：前期所有 AI 推导的阶段变更必须人工确认。积累足够「建议-确认」准确率数据后，仅对高置信度、低风险的类目（如"标记需要跟进"）评估是否开放自动化。
2. **多 case 歧义**：同一 WhatsApp 号对应多个 case 时，AI 先判断对话归属；无法判断则进待认领收件箱，不强行挂靠。
3. **隐私合规**：对话含 PHI，须确认所用 LLM 的数据处理条款（不用于训练、数据驻留），隐私政策覆盖；Meta 对医疗类消息模板有额外审核。
4. **多语言优势**：患者用印尼语/阿拉伯语等沟通时，LLM 直接输出英文（或管理员工作语言）摘要，降低管理成本。
5. **AI 推导结果同样只走现有状态机**：不绕过 `treatment-stage-transitions` 校验，非法流转照旧被拒绝。

### 7.3 影响评估

**对现有流程的影响**：纯新增管道 + 只读分析层，不触碰现有消息链路；AI 建议在被确认前不产生任何数据变更。

---

## 8. 里程碑总览

| Phase | 交付物 | 依赖 | 风险 |
|---|---|---|---|
| P1 | 手动建 case、Lifecycle 看板、进度步进器、材料按阶段归档、ADMIN_NOTE | 无 | 低 |
| P2 | 患者合并、case 合并（事务 + dry-run + 审计） | P1 | 中（合并需谨慎，必须审计 + 软删除） |
| P3 | 入站邮件自动归集、待认领收件箱 | P1 | 中（匹配规则需运营验证） |
| P4 | P4a WhatsApp 消息管道；P4b AI 对话分析与状态推导（建议制 + 人工确认） | P1、P3 | 高（外部 API 依赖 + 企业认证周期；AI 层须人工确认兜底） |

每个 Phase 均为独立 PR 集、独立 migration、可独立回滚；未上线的 Phase 不影响已上线部分。
