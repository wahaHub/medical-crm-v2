import { pgTable, varchar, timestamp, text, integer, index, uniqueIndex, foreignKey, uuid, jsonb, boolean, bigint, unique, pgPolicy, pgEnum, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const aiSummaryStatus = pgEnum("AISummaryStatus", ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
export const auditEvent = pgEnum("AuditEvent", ['DOC_UPLOAD', 'DOC_VIEW', 'DOC_DOWNLOAD', 'DOC_DELETE', 'DOC_SHARE_LINK_CREATED', 'DOC_SHARE_LINK_USED', 'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_REVOKED', 'CASE_STATUS_CHANGED', 'USER_LOGIN', 'USER_LOGOUT'])
export const caseStage = pgEnum("CaseStage", ['PENDING_ASSIGNMENT', 'TRANSFERRED_TO_HOSPITAL', 'HOSPITAL_CONTACTED', 'CONSULTATION_SCHEDULED', 'IN_TREATMENT', 'TREATMENT_COMPLETED'])
export const caseStatus = pgEnum("CaseStatus", ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'])
export const consultationStatus = pgEnum("ConsultationStatus", ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
export const conversationCategory = pgEnum("ConversationCategory", ['HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT'])
export const documentStatus = pgEnum("DocumentStatus", ['PENDING', 'ACTIVE', 'DELETED'])
export const documentType = pgEnum("DocumentType", ['LAB', 'IMAGING', 'DISCHARGE', 'PRESCRIPTION', 'ID', 'DIAGNOSIS', 'QUOTE', 'INVITATION', 'OTHER'])
export const hospitalStatus = pgEnum("HospitalStatus", ['ACTIVE', 'PENDING', 'INACTIVE'])
export const hospitalType = pgEnum("HospitalType", ['COSMETIC', 'REGULAR'])
export const messageType = pgEnum("MessageType", ['TEXT', 'IMAGE', 'FILE', 'SYSTEM'])
export const moderationStatus = pgEnum("ModerationStatus", ['ALLOWED', 'BLOCKED', 'REVIEW'])
export const progressType = pgEnum("ProgressType", ['STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'VIDEO_CONSULTATION', 'MESSAGE', 'APPOINTMENT'])
export const riskLevel = pgEnum("RiskLevel", ['LOW', 'MEDIUM', 'HIGH'])
export const sensitivity = pgEnum("Sensitivity", ['PHI_HIGH', 'PHI_MED', 'PHI_LOW'])
export const userRole = pgEnum("UserRole", ['ADMIN', 'HOSPITAL', 'PATIENT'])
export const caseAssignmentStatus = pgEnum("CaseAssignmentStatus", ['UNASSIGNED', 'ASSIGNED'])
export const caseTreatmentStage = pgEnum("CaseTreatmentStage", ['CONFIRMED', 'IN_TREATMENT', 'POST_TREATMENT', 'COMPLETED', 'FOLLOW_UP'])
export const chcSubStatus = pgEnum("CHCSubStatus", ['DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED'])
export const quoteStatus = pgEnum("QuoteStatus", ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'])
export const caseEventType = pgEnum("CaseEventType", [
  'CASE_CREATED', 'CASE_DISTRIBUTED', 'CASE_ASSIGNED', 'CASE_STATUS_CHANGED', 'CASE_STAGE_ADVANCED',
  'HOSPITALS_SELECTED', 'HOSPITAL_REPLIED', 'HOSPITAL_NEED_INFO', 'HOSPITAL_REMOVED',
  'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED', 'QUOTE_RESENT',
  'MESSAGE_SENT', 'MESSAGE_RECEIVED',
  'QUESTIONNAIRE_SUBMITTED', 'CONSULTATION_SCHEDULED', 'CONSULTATION_COMPLETED',
  'DOCUMENT_UPLOADED',
  'ORDER_PLACED', 'ORDER_STATUS_CHANGED',
  'MILESTONE_ADDED', 'MILESTONE_UPDATED', 'JOURNEY_UPDATED',
  'TICKET_CREATED', 'TICKET_RESOLVED',
  'AI_SUMMARY_GENERATED',
])
export const actorType = pgEnum("ActorType", ['PATIENT', 'HOSPITAL', 'ADMIN', 'SYSTEM'])


export const prismaMigrations = pgTable("_prisma_migrations", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	checksum: varchar({ length: 64 }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	logs: text(),
	rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: 'string' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const hospitals = pgTable("hospitals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	nameEn: varchar("name_en", { length: 200 }),
	address: text(),
	city: varchar({ length: 200 }),
	phone: varchar({ length: 50 }),
	email: varchar({ length: 255 }),
	description: text(),
	logoUrl: varchar("logo_url", { length: 500 }),
	specialties: jsonb(),
	status: hospitalStatus().default('PENDING').notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
	type: hospitalType().default('COSMETIC').notNull(),
}, (table) => [
	index("hospitals_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("hospitals_type_idx").using("btree", table.type.asc().nullsLast().op("enum_ops")),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	role: userRole().default('PATIENT').notNull(),
	hospitalId: uuid("hospital_id"),
	avatarUrl: varchar("avatar_url", { length: 500 }),
	status: varchar({ length: 20 }).default('active').notNull(),
	lastLoginAt: timestamp("last_login_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
	patientCode: varchar("patient_code", { length: 20 }),
	country: varchar({ length: 100 }),
	preferredLanguage: varchar("preferred_language", { length: 10 }).default('zh').notNull(),
	phone: varchar({ length: 20 }),
	passwordHash: varchar("password_hash", { length: 255 }),
	notificationSettings: jsonb("notification_settings"),
}, (table) => [
	index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("users_patient_code_key").using("btree", table.patientCode.asc().nullsLast().op("text_ops")),
	index("users_role_idx").using("btree", table.role.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.hospitalId],
			foreignColumns: [hospitals.id],
			name: "users_hospital_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const cases = pgTable("cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseNumber: varchar("case_number", { length: 50 }).notNull(),
	patientId: uuid("patient_id").notNull(),
	assignedHospitalId: uuid("assigned_hospital_id"),
	patientName: varchar("patient_name", { length: 100 }).notNull(),
	patientCountry: varchar("patient_country", { length: 100 }),
	patientLanguage: varchar("patient_language", { length: 10 }).default('en').notNull(),
	primaryDiagnosis: text("primary_diagnosis"),
	diagnosisCode: varchar("diagnosis_code", { length: 50 }),
	symptoms: jsonb(),
	medicalHistory: text("medical_history"),
	aiSummaryZh: text("ai_summary_zh"),
	aiSummaryEn: text("ai_summary_en"),
	aiSummary: text("ai_summary"),
	aiSummaryLanguage: varchar("ai_summary_language", { length: 10 }),
	riskLevel: riskLevel("risk_level"),
	status: caseStatus().default('ACTIVE').notNull(),
	stage: caseStage().default('PENDING_ASSIGNMENT').notNull(),
	assignedAt: timestamp("assigned_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
	assignmentStatus: caseAssignmentStatus("assignment_status").default('UNASSIGNED').notNull(),
	treatmentStage: caseTreatmentStage("treatment_stage"),
	conditionSummary: text("condition_summary"),
	structuredData: jsonb("structured_data"),
	riskFlags: jsonb("risk_flags"),
	priority: varchar({ length: 20 }),
	lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: 'string' }),
	aiSummaryStatus: aiSummaryStatus("ai_summary_status").default('PENDING').notNull(),
	questionCollectorTemplateId: uuid("question_collector_template_id"),
}, (table) => [
	index("cases_assigned_hospital_id_idx").using("btree", table.assignedHospitalId.asc().nullsLast().op("uuid_ops")),
	index("cases_case_number_idx").using("btree", table.caseNumber.asc().nullsLast().op("text_ops")),
	uniqueIndex("cases_case_number_key").using("btree", table.caseNumber.asc().nullsLast().op("text_ops")),
	index("cases_patient_id_idx").using("btree", table.patientId.asc().nullsLast().op("uuid_ops")),
	index("cases_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	index("cases_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.assignedHospitalId],
			foreignColumns: [hospitals.id],
			name: "cases_assigned_hospital_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.patientId],
			foreignColumns: [users.id],
			name: "cases_patient_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	uploadedById: uuid("uploaded_by_id").notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileSize: integer("file_size").notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	storageKey: varchar("storage_key", { length: 500 }).notNull(),
	sha256: varchar({ length: 64 }),
	documentType: documentType("document_type").notNull(),
	sensitivity: sensitivity().default('PHI_HIGH').notNull(),
	language: varchar({ length: 10 }).default('en').notNull(),
	isTranslated: boolean("is_translated").default(false).notNull(),
	sourceDocId: uuid("source_doc_id"),
	version: integer().default(1).notNull(),
	status: documentStatus().default('ACTIVE').notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("documents_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("documents_document_type_idx").using("btree", table.documentType.asc().nullsLast().op("enum_ops")),
	index("documents_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	uniqueIndex("documents_storage_key_key").using("btree", table.storageKey.asc().nullsLast().op("text_ops")),
	index("documents_uploaded_by_id_idx").using("btree", table.uploadedById.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "documents_case_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.sourceDocId],
			foreignColumns: [table.id],
			name: "documents_source_doc_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.uploadedById],
			foreignColumns: [users.id],
			name: "documents_uploaded_by_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
]);

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	hospitalId: uuid("hospital_id"),
	event: auditEvent().notNull(),
	caseId: uuid("case_id"),
	documentId: uuid("document_id"),
	ipAddress: varchar("ip_address", { length: 50 }),
	userAgent: text("user_agent"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("audit_logs_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("audit_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("audit_logs_document_id_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("audit_logs_event_idx").using("btree", table.event.asc().nullsLast().op("enum_ops")),
	index("audit_logs_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops")),
	index("audit_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_logs_user_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
]);

export const caseProgress = pgTable("case_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	progressType: progressType("progress_type").notNull(),
	videoSummary: jsonb("video_summary"),
	recordedAt: timestamp("recorded_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	recordedById: uuid("recorded_by_id"),
}, (table) => [
	index("case_progress_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_progress_progress_type_idx").using("btree", table.progressType.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_progress_case_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

// INTENTIONAL SCHEMA DRIFT: conversations and messages have a circular FK in the DB
// (messages.conversation_id → conversations.id AND conversations.last_message_id → messages.id).
// The last_message_id FK is omitted from the Drizzle schema to break the circular dependency.
// This is a known, intentional drift between the Drizzle schema and the live DB.
// The FK constraint "conversations_last_message_id_fkey" still exists in PostgreSQL.
// The Drizzle relation is defined in relations.ts for query purposes.
// If running `drizzle-kit check`, this FK will show as a difference — this is expected.
export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	category: conversationCategory().notNull(),
	title: varchar({ length: 200 }),
	hospitalId: uuid("hospital_id"),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
	lastMessageId: uuid("last_message_id"),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
	lastMessagePreview: text("last_message_preview"),
	lastSenderId: uuid("last_sender_id"),
}, (table) => [
	index("conversations_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("conversations_category_idx").using("btree", table.category.asc().nullsLast().op("enum_ops")),
	index("idx_conversations_hospital_category_time").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops"), table.category.asc().nullsLast().op("enum_ops"), table.lastMessageAt.desc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "conversations_case_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.lastSenderId],
			foreignColumns: [users.id],
			name: "conversations_last_sender_id_fkey"
		}).onDelete("set null"),
]);

export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	senderId: uuid("sender_id").notNull(),
	content: text().notNull(),
	originalLanguage: varchar("original_language", { length: 10 }).default('en').notNull(),
	translatedContent: text("translated_content"),
	messageType: messageType("message_type").default('TEXT').notNull(),
	moderationStatus: moderationStatus("moderation_status").default('ALLOWED').notNull(),
	attachments: jsonb(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	aiSummary: text("ai_summary"),
}, (table) => [
	index("idx_messages_ai_summary").using("btree", table.id.asc().nullsLast().op("uuid_ops")).where(sql`(ai_summary IS NOT NULL)`),
	index("idx_messages_conversation_time").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("messages_conversation_id_idx").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("messages_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("messages_sender_id_idx").using("btree", table.senderId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "messages_conversation_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "messages_sender_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
]);

export const consultations = pgTable("consultations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	hospitalId: uuid("hospital_id").notNull(),
	patientId: uuid("patient_id").notNull(),
	doctorId: uuid("doctor_id"),
	status: consultationStatus().default('SCHEDULED').notNull(),
	scheduledAt: timestamp("scheduled_at", { precision: 6, mode: 'string' }).notNull(),
	startedAt: timestamp("started_at", { precision: 6, mode: 'string' }),
	endedAt: timestamp("ended_at", { precision: 6, mode: 'string' }),
	durationMinutes: integer("duration_minutes").default(30).notNull(),
	actualDuration: integer("actual_duration"),
	consultationLink: varchar("consultation_link", { length: 500 }),
	aiTranslation: boolean("ai_translation").default(false).notNull(),
	patientLanguage: varchar("patient_language", { length: 10 }).default('en').notNull(),
	notes: text(),
	videoStorageKey: varchar("video_storage_key", { length: 500 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoSize: bigint("video_size", { mode: "number" }),
	videoDuration: integer("video_duration"),
	videoThumbnail: varchar("video_thumbnail", { length: 500 }),
	videoUploadedAt: timestamp("video_uploaded_at", { precision: 6, mode: 'string' }),
	aiSummary: jsonb("ai_summary"),
	aiSummaryCreatedAt: timestamp("ai_summary_created_at", { precision: 6, mode: 'string' }),
	aiSummaryStatus: aiSummaryStatus("ai_summary_status").default('PENDING').notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("consultations_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("consultations_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops")),
	index("consultations_patient_id_idx").using("btree", table.patientId.asc().nullsLast().op("uuid_ops")),
	index("consultations_scheduled_at_idx").using("btree", table.scheduledAt.asc().nullsLast().op("timestamp_ops")),
	index("consultations_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("idx_consultations_translation_scheduled").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops")).where(sql`((ai_translation = true) AND (status = 'SCHEDULED'::"ConsultationStatus"))`),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "consultations_case_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
	foreignKey({
			columns: [table.patientId],
			foreignColumns: [users.id],
			name: "consultations_patient_id_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
]);

export const consultationTranscripts = pgTable("consultation_transcripts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	consultationId: uuid("consultation_id").notNull(),
	originalLang: varchar("original_lang", { length: 10 }).default('en').notNull(),
	translatedLang: varchar("translated_lang", { length: 10 }),
	entries: jsonb().default([]).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	generatedAt: timestamp("generated_at", { precision: 6, mode: 'string' }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_consultation_transcripts_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.consultationId],
			foreignColumns: [consultations.id],
			name: "consultation_transcripts_consultation_id_fkey"
		}).onDelete("cascade"),
	unique("consultation_transcripts_consultation_id_key").on(table.consultationId),
	pgPolicy("Admins can manage all consultation transcripts", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'ADMIN'::"UserRole"))))` }),
	pgPolicy("Hospital users can view their consultation transcripts", { as: "permissive", for: "select", to: ["public"] }),
]);

export const translationTasks = pgTable("translation_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	hospitalType: text("hospital_type").notNull(),
	entityType: text("entity_type").notNull(),
	entityId: uuid("entity_id").notNull(),
	sourceLanguage: text("source_language").default('zh').notNull(),
	targetLanguage: text("target_language").notNull(),
	status: text().default('pending'),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_translation_tasks_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_translation_tasks_entity").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("uuid_ops")),
	index("idx_translation_tasks_hospital_type").using("btree", table.hospitalType.asc().nullsLast().op("text_ops")),
	index("idx_translation_tasks_pending").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'pending'::text)`),
	index("idx_translation_tasks_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("translation_tasks_hospital_type_entity_type_entity_id_sourc_key").on(table.hospitalType, table.entityType, table.entityId, table.sourceLanguage, table.targetLanguage),
]);

export const hospitalRegistrationTokens = pgTable("hospital_registration_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	hospitalId: uuid("hospital_id").notNull(),
	token: varchar({ length: 100 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	expiresAt: timestamp("expires_at", { precision: 6, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { precision: 6, mode: 'string' }),
	keycloakUserId: varchar("keycloak_user_id", { length: 100 }),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("hospital_registration_tokens_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("hospital_registration_tokens_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast().op("uuid_ops")),
	index("hospital_registration_tokens_token_idx").using("btree", table.token.asc().nullsLast().op("text_ops")),
	uniqueIndex("hospital_registration_tokens_token_key").using("btree", table.token.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.hospitalId],
			foreignColumns: [hospitals.id],
			name: "hospital_registration_tokens_hospital_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const messageTasks = pgTable("message_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	messageId: uuid("message_id").notNull(),
	taskKind: text("task_kind").notNull(),
	targetLanguage: varchar("target_language", { length: 10 }),
	status: text().default('PENDING').notNull(),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("message_tasks_pending_idx").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = 'PENDING'::text)`),
	index("message_tasks_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.id],
			name: "message_tasks_message_id_fkey"
		}).onDelete("cascade"),
]);

export const quotes = pgTable("quotes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	quoteNumber: varchar("quote_number", { length: 50 }).notNull().unique(),
	version: integer().default(1).notNull(),
	status: quoteStatus().default('PENDING').notNull(),
	isDraft: boolean("is_draft").default(true).notNull(),
	totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
	currency: varchar({ length: 10 }).default('USD').notNull(),
	validUntil: timestamp("valid_until", { precision: 6, withTimezone: true, mode: 'string' }).notNull(),
	treatmentPlan: text("treatment_plan"),
	lineItems: jsonb("line_items"),
	notes: text(),
	sentAt: timestamp("sent_at", { precision: 6, withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'string' }).notNull(),
});

export const caseHospitalContacts = pgTable("case_hospital_contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	subStatus: chcSubStatus("sub_status").default('DISTRIBUTED').notNull(),
	selectedByPatientAt: timestamp("selected_by_patient_at", { precision: 6, withTimezone: true, mode: 'string' }),
	distributedAt: timestamp("distributed_at", { precision: 6, withTimezone: true, mode: 'string' }).defaultNow(),
	firstReplyAt: timestamp("first_reply_at", { precision: 6, withTimezone: true, mode: 'string' }),
	quoteId: uuid("quote_id").references(() => quotes.id),
	patientViewedQuoteAt: timestamp("patient_viewed_quote_at", { precision: 6, withTimezone: true, mode: 'string' }),
	patientAcceptedAt: timestamp("patient_accepted_at", { precision: 6, withTimezone: true, mode: 'string' }),
	patientRejectedAt: timestamp("patient_rejected_at", { precision: 6, withTimezone: true, mode: 'string' }),
	reminderSentAt: timestamp("reminder_sent_at", { precision: 6, withTimezone: true, mode: 'string' }),
	removedAt: timestamp("removed_at", { precision: 6, withTimezone: true, mode: 'string' }),
	removedReason: text("removed_reason"),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("case_hospital_contacts_case_id_hospital_id_key").on(table.caseId, table.hospitalId),
]);

// Phase 2 M3: Support Tickets
export const ticketType = pgEnum("TicketType", ['ACCOUNT_ISSUES', 'PAYMENT_PROBLEMS', 'HOSPITAL_COMMUNICATION', 'DOCUMENT_HELP', 'VISA_TRAVEL', 'GENERAL_QUESTIONS', 'FEEDBACK'])
export const ticketPriority = pgEnum("TicketPriority", ['HIGH', 'MEDIUM', 'LOW'])
export const ticketStatus = pgEnum("TicketStatus", ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'CLOSED'])
export const ticketReplyRole = pgEnum("TicketReplyRole", ['ADMIN', 'PATIENT'])

export const supportTickets = pgTable("support_tickets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ticketNumber: varchar("ticket_number", { length: 50 }).notNull().unique(),
	patientId: uuid("patient_id").notNull().references(() => users.id),
	caseId: uuid("case_id").references(() => cases.id),
	type: ticketType().notNull(),
	priority: ticketPriority().default('MEDIUM').notNull(),
	status: ticketStatus().default('OPEN').notNull(),
	subject: varchar({ length: 500 }),
	description: text().notNull(),
	sourcePage: varchar("source_page", { length: 200 }),
	assignedTo: uuid("assigned_to").references(() => users.id),
	slaDeadline: timestamp("sla_deadline", { withTimezone: true, mode: 'string' }),
	resolutionNote: text("resolution_note"),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_tickets_patient_status").using("btree", table.patientId.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_tickets_queue").using("btree", table.status.asc().nullsLast(), table.priority.asc().nullsLast(), table.slaDeadline.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
]);

export const supportTicketReplies = pgTable("support_ticket_replies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
	authorId: uuid("author_id").notNull().references(() => users.id),
	authorRole: ticketReplyRole("author_role").notNull(),
	content: text().notNull(),
	isInternalNote: boolean("is_internal_note").default(false).notNull(),
	attachments: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ticket_replies_ticket").using("btree", table.ticketId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
]);

export const caseEvents = pgTable("case_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	eventType: caseEventType("event_type").notNull(),
	actorType: actorType("actor_type").notNull(),
	actorId: uuid("actor_id"),
	eventData: jsonb("event_data"),
	isVisibleToPatient: boolean("is_visible_to_patient").default(false).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

// Phase 2 M4: Orders + Packages
export const packageType = pgEnum("PackageType", [
	'CONSULTATION',
	'HEALTH_CHECKUP',
	'SECOND_OPINION',
	'VISA_PACKAGE',
	'INSURANCE',
	'ACCOMMODATION',
	'TREATMENT_DEPOSIT',
	'TRANSLATION',
])
export const packageStatus = pgEnum("PackageStatus", ['DRAFT', 'PUBLISHED'])
export const orderType = pgEnum("OrderType", [
	'CONSULTATION',
	'HEALTH_CHECKUP',
	'SECOND_OPINION',
	'VISA_PACKAGE',
	'INSURANCE',
	'ACCOMMODATION',
	'TREATMENT_DEPOSIT',
	'TRANSLATION',
])
export const orderStatus = pgEnum("OrderStatus", ['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'])

export const packages = pgTable("packages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nameEn: varchar("name_en", { length: 200 }).notNull(),
	nameZh: varchar("name_zh", { length: 200 }),
	type: packageType().notNull(),
	price: numeric({ precision: 12, scale: 2 }).notNull(),
	currency: varchar({ length: 10 }).default('USD').notNull(),
	descriptionEn: text("description_en"),
	descriptionZh: text("description_zh"),
	inclusions: jsonb(),
	coverImageUrl: varchar("cover_image_url", { length: 500 }),
	sortWeight: integer("sort_weight").default(0),
	status: packageStatus().default('DRAFT').notNull(),
	publishAt: timestamp("publish_at", { withTimezone: true, mode: 'string' }),
	takedownAt: timestamp("takedown_at", { withTimezone: true, mode: 'string' }),
	config: jsonb(),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_packages_status_type").using("btree", table.status.asc().nullsLast(), table.type.asc().nullsLast(), table.publishAt.desc().nullsLast()),
	index("idx_packages_created_by_status").using("btree", table.createdBy.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
]);

// Phase 2 M5: Journey + Milestones
export const milestoneEventType = pgEnum("MilestoneEventType", [
	'FLIGHT_ARRIVAL', 'FLIGHT_DEPARTURE',
	'HOTEL_CHECKIN', 'HOTEL_CHECKOUT',
	'HOSPITAL_APPOINTMENT', 'PRE_OP_EXAM', 'SURGERY_DATE', 'POST_OP_CHECKUP',
	'MEDICATION_SCHEDULE', 'FOLLOW_UP_REMOTE',
	'VISA_APPLICATION', 'VISA_APPROVED',
	'INSURANCE_CONFIRMED',
	'CUSTOM',
])

export const caseJourneys = pgTable("case_journeys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	visa: jsonb(),
	insurance: jsonb(),
	accommodation: jsonb(),
	transportation: jsonb(),
	postCare: jsonb("post_care"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("idx_case_journeys_case").using("btree", table.caseId.asc().nullsLast()),
]);

export const journeyMilestones = pgTable("journey_milestones", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	eventType: milestoneEventType("event_type").notNull(),
	eventDate: timestamp("event_date", { withTimezone: true, mode: 'string' }).notNull(),
	note: text(),
	isVisibleToPatient: boolean("is_visible_to_patient").default(true).notNull(),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_milestones_case_date").using("btree", table.caseId.asc().nullsLast(), table.eventDate.asc().nullsLast()),
	index("idx_milestones_patient_visible").using("btree", table.isVisibleToPatient.asc().nullsLast(), table.eventDate.asc().nullsLast()).where(sql`is_visible_to_patient = true`),
]);

// Phase 2 M6: QuestionCollector
export const qcCompletionStatus = pgEnum("QCCompletionStatus", ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])

export const questionCollectorTemplates = pgTable("question_collector_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	templateName: varchar("template_name", { length: 200 }).notNull(),
	category: varchar({ length: 100 }).notNull(),
	procedureTypes: text("procedure_types").array(),
	questions: jsonb().notNull(),
	version: integer().default(1).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_qct_active").using("btree", table.isActive.asc().nullsLast(), table.category.asc().nullsLast()),
]);

export const questionCollectorResponses = pgTable("question_collector_responses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull().references(() => cases.id),
	templateId: uuid("template_id").notNull().references(() => questionCollectorTemplates.id),
	userId: uuid("user_id").notNull().references(() => users.id),
	responses: jsonb().notNull(),
	extractedData: jsonb("extracted_data"),
	riskFlags: text("risk_flags").array(),
	completionStatus: qcCompletionStatus("completion_status").default('NOT_STARTED').notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_qcr_case").using("btree", table.caseId.asc().nullsLast(), table.submittedAt.desc().nullsFirst()),
	index("idx_qcr_completion_submitted").using("btree", table.completionStatus.asc().nullsLast(), table.submittedAt.desc().nullsFirst()),
]);

export const questionCollectorCustomizations = pgTable("question_collector_customizations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	templateId: uuid("template_id").notNull().references(() => questionCollectorTemplates.id),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	customizedQuestions: jsonb("customized_questions").notNull(),
	customizedBy: uuid("customized_by").references(() => users.id),
	customizedAt: timestamp("customized_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("question_collector_customizations_template_id_hospital_id_key").on(table.templateId, table.hospitalId),
	index("idx_qcc_template_hospital").using("btree", table.templateId.asc().nullsLast(), table.hospitalId.asc().nullsLast()),
]);

// Phase 2 M7: ServiceCatalog + QuoteTemplates
export const serviceCatalogCategory = pgEnum("ServiceCatalogCategory", [
	'COSMETIC_SURGERY', 'DENTAL', 'DERMATOLOGY', 'ORTHOPEDIC',
	'CARDIAC', 'OPHTHALMIC', 'FERTILITY', 'WEIGHT_LOSS',
	'HAIR_RESTORATION', 'WELLNESS', 'OTHER',
])

export const serviceCatalogItems = pgTable("service_catalog_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	nameEn: varchar("name_en", { length: 200 }).notNull(),
	nameZh: varchar("name_zh", { length: 200 }),
	category: serviceCatalogCategory().notNull(),
	priceMin: numeric("price_min", { precision: 12, scale: 2 }).notNull(),
	priceMax: numeric("price_max", { precision: 12, scale: 2 }).notNull(),
	currency: varchar({ length: 10 }).default('USD').notNull(),
	estimatedStayDays: integer("estimated_stay_days"),
	estimatedRecoveryDays: integer("estimated_recovery_days"),
	inclusions: jsonb(),
	isPublic: boolean("is_public").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_sci_hospital_active").using("btree", table.hospitalId.asc().nullsLast(), table.isActive.asc().nullsLast(), table.category.asc().nullsLast()),
	index("idx_sci_hospital_public").using("btree", table.hospitalId.asc().nullsLast(), table.isPublic.asc().nullsLast()).where(sql`is_public = true`),
]);

export const quoteTemplates = pgTable("quote_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	name: varchar({ length: 200 }).notNull(),
	conditionCategory: varchar("condition_category", { length: 100 }),
	lineItemsTemplate: jsonb("line_items_template").notNull(),
	defaultValidDays: integer("default_valid_days").default(30).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_qt_hospital_active").using("btree", table.hospitalId.asc().nullsLast(), table.isActive.asc().nullsLast()),
]);

export const orders = pgTable("orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
	patientId: uuid("patient_id").notNull().references(() => users.id),
	caseId: uuid("case_id").references(() => cases.id),
	packageId: uuid("package_id").references(() => packages.id),
	type: orderType().notNull(),
	amount: numeric({ precision: 12, scale: 2 }).notNull(),
	currency: varchar({ length: 10 }).default('USD').notNull(),
	status: orderStatus().default('PENDING_PAYMENT').notNull(),
	paymentMethod: varchar("payment_method", { length: 50 }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 }),
	refundReason: text("refund_reason"),
	metadata: jsonb(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_orders_patient_status").using("btree", table.patientId.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_orders_status_type").using("btree", table.status.asc().nullsLast(), table.type.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_orders_case_created").using("btree", table.caseId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`case_id IS NOT NULL`),
]);

// Phase 2 M9: BookingRequest
export const bookingRequestStatus = pgEnum("BookingRequestStatus", ['PENDING', 'HOSPITALS_MATCHED', 'SELECTIONS_SAVED', 'COMPLETED', 'EXPIRED'])
export const bookingConditionType = pgEnum("BookingConditionType", ['COSMETIC', 'MEDICAL', 'DENTAL', 'WELLNESS', 'OTHER'])

export const bookingRequests = pgTable("booking_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").references(() => users.id),
	requestNumber: varchar("request_number", { length: 50 }).notNull().unique(),
	conditionType: bookingConditionType("condition_type").notNull(),
	conditionCategory: varchar("condition_category", { length: 100 }).notNull(),
	conditionDescription: text("condition_description"),
	destinationPreference: jsonb("destination_preference"),
	preferredLanguage: varchar("preferred_language", { length: 10 }).default('en').notNull(),
	status: bookingRequestStatus().default('PENDING').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_booking_requests_user").using("btree", table.userId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_booking_requests_status").using("btree", table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
]);

export const bookingRequestHospitals = pgTable("booking_request_hospitals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bookingRequestId: uuid("booking_request_id").notNull().references(() => bookingRequests.id, { onDelete: 'cascade' }),
	hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
	isRecommended: boolean("is_recommended").default(false).notNull(),
	matchScore: integer("match_score"),
	recommendationReason: text("recommendation_reason"),
	selectedByPatient: boolean("selected_by_patient").default(false).notNull(),
	selectedAt: timestamp("selected_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("booking_request_hospitals_br_hospital_key").on(table.bookingRequestId, table.hospitalId),
	index("idx_booking_request_hospitals_br").using("btree", table.bookingRequestId.asc().nullsLast()),
]);

export const chatbotFaqItems = pgTable("chatbot_faq_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	category: varchar({ length: 100 }).notNull(),
	questionEn: text("question_en").notNull(),
	questionZh: text("question_zh").notNull(),
	answerEn: text("answer_en").notNull(),
	answerZh: text("answer_zh").notNull(),
	keywords: jsonb().default([]),
	isActive: boolean("is_active").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	hospitalId: uuid("hospital_id"),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("chatbot_faq_items_category_idx").using("btree", table.category.asc().nullsLast()),
	index("chatbot_faq_items_is_active_idx").using("btree", table.isActive.asc().nullsLast()),
	index("chatbot_faq_items_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast()),
]);

export const emailTemplates = pgTable("email_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	hospitalId: uuid("hospital_id").notNull(),
	name: varchar({ length: 200 }).notNull(),
	type: varchar({ length: 50 }).notNull(),
	subject: varchar({ length: 500 }).notNull(),
	body: text().notNull(),
	variables: jsonb().default([]),
	status: varchar({ length: 20 }).default('draft').notNull(),
	createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
	deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
}, (table) => [
	index("email_templates_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast()),
	index("email_templates_type_idx").using("btree", table.type.asc().nullsLast()),
	index("email_templates_status_idx").using("btree", table.status.asc().nullsLast()),
]);
