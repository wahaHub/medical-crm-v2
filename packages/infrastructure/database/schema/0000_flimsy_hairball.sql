-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."AISummaryStatus" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."AuditEvent" AS ENUM('DOC_UPLOAD', 'DOC_VIEW', 'DOC_DOWNLOAD', 'DOC_DELETE', 'DOC_SHARE_LINK_CREATED', 'DOC_SHARE_LINK_USED', 'CASE_CREATED', 'CASE_ASSIGNED', 'CASE_REVOKED', 'CASE_STATUS_CHANGED', 'USER_LOGIN', 'USER_LOGOUT');--> statement-breakpoint
CREATE TYPE "public"."CaseStage" AS ENUM('PENDING_ASSIGNMENT', 'TRANSFERRED_TO_HOSPITAL', 'HOSPITAL_CONTACTED', 'CONSULTATION_SCHEDULED', 'IN_TREATMENT', 'TREATMENT_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."CaseStatus" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."ConsultationStatus" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."ConversationCategory" AS ENUM('HOSPITAL', 'PATIENT', 'ADMIN_HOSPITAL', 'ADMIN_PATIENT', 'HOSPITAL_PATIENT');--> statement-breakpoint
CREATE TYPE "public"."DocumentStatus" AS ENUM('PENDING', 'ACTIVE', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."DocumentType" AS ENUM('LAB', 'IMAGING', 'DISCHARGE', 'PRESCRIPTION', 'ID', 'DIAGNOSIS', 'QUOTE', 'INVITATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."HospitalStatus" AS ENUM('ACTIVE', 'PENDING', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."HospitalType" AS ENUM('COSMETIC', 'REGULAR');--> statement-breakpoint
CREATE TYPE "public"."MessageType" AS ENUM('TEXT', 'IMAGE', 'FILE', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ModerationStatus" AS ENUM('ALLOWED', 'BLOCKED', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."ProgressType" AS ENUM('STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'VIDEO_CONSULTATION', 'MESSAGE', 'APPOINTMENT');--> statement-breakpoint
CREATE TYPE "public"."RiskLevel" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."Sensitivity" AS ENUM('PHI_HIGH', 'PHI_MED', 'PHI_LOW');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('ADMIN', 'HOSPITAL', 'PATIENT');--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" varchar(50) NOT NULL,
	"patient_id" uuid NOT NULL,
	"assigned_hospital_id" uuid,
	"patient_name" varchar(100) NOT NULL,
	"patient_country" varchar(100),
	"patient_language" varchar(10) DEFAULT 'en' NOT NULL,
	"primary_diagnosis" text,
	"diagnosis_code" varchar(50),
	"symptoms" jsonb,
	"medical_history" text,
	"ai_summary_zh" text,
	"ai_summary_en" text,
	"risk_level" "RiskLevel",
	"status" "CaseStatus" DEFAULT 'ACTIVE' NOT NULL,
	"stage" "CaseStage" DEFAULT 'PENDING_ASSIGNMENT' NOT NULL,
	"assigned_at" timestamp(6),
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"sha256" varchar(64),
	"document_type" "DocumentType" NOT NULL,
	"sensitivity" "Sensitivity" DEFAULT 'PHI_HIGH' NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"is_translated" boolean DEFAULT false NOT NULL,
	"source_doc_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "DocumentStatus" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hospital_id" uuid,
	"event" "AuditEvent" NOT NULL,
	"case_id" uuid,
	"document_id" uuid,
	"ip_address" varchar(50),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"progress_type" "ProgressType" NOT NULL,
	"video_summary" jsonb,
	"recorded_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"recorded_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" "UserRole" DEFAULT 'PATIENT' NOT NULL,
	"hospital_id" uuid,
	"avatar_url" varchar(500),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp(6),
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL,
	"patient_code" varchar(20),
	"country" varchar(100),
	"preferred_language" varchar(10) DEFAULT 'zh' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"original_language" varchar(10) DEFAULT 'en' NOT NULL,
	"translated_content" text,
	"message_type" "MessageType" DEFAULT 'TEXT' NOT NULL,
	"moderation_status" "ModerationStatus" DEFAULT 'ALLOWED' NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ai_summary" text
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"name_en" varchar(200),
	"address" text,
	"phone" varchar(50),
	"email" varchar(255),
	"description" text,
	"logo_url" varchar(500),
	"specialties" jsonb,
	"status" "HospitalStatus" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL,
	"type" "HospitalType" DEFAULT 'COSMETIC' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"hospital_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid,
	"status" "ConsultationStatus" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp(6) NOT NULL,
	"started_at" timestamp(6),
	"ended_at" timestamp(6),
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"actual_duration" integer,
	"consultation_link" varchar(500),
	"ai_translation" boolean DEFAULT false NOT NULL,
	"patient_language" varchar(10) DEFAULT 'en' NOT NULL,
	"notes" text,
	"video_storage_key" varchar(500),
	"video_size" bigint,
	"video_duration" integer,
	"video_thumbnail" varchar(500),
	"video_uploaded_at" timestamp(6),
	"ai_summary" jsonb,
	"ai_summary_created_at" timestamp(6),
	"ai_summary_status" "AISummaryStatus" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultation_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"original_lang" varchar(10) DEFAULT 'en' NOT NULL,
	"translated_lang" varchar(10),
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"generated_at" timestamp(6),
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_transcripts_consultation_id_key" UNIQUE("consultation_id")
);
--> statement-breakpoint
ALTER TABLE "consultation_transcripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "translation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_language" text DEFAULT 'zh' NOT NULL,
	"target_language" text NOT NULL,
	"status" text DEFAULT 'pending',
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "translation_tasks_hospital_type_entity_type_entity_id_sourc_key" UNIQUE("hospital_type","entity_type","entity_id","source_language","target_language")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"category" "ConversationCategory" NOT NULL,
	"title" varchar(200),
	"hospital_id" uuid,
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_sender_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hospital_registration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"token" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"expires_at" timestamp(6) NOT NULL,
	"used_at" timestamp(6),
	"keycloak_user_id" varchar(100),
	"created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(6) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_hospital_id_fkey" FOREIGN KEY ("assigned_hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_doc_id_fkey" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "case_progress" ADD CONSTRAINT "case_progress_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consultation_transcripts" ADD CONSTRAINT "consultation_transcripts_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
-- NOTE: conversations_last_message_id_fkey (last_message_id -> messages.id) intentionally omitted
-- from Drizzle schema to break circular FK (messages <-> conversations). Constraint exists in DB.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_last_sender_id_fkey" FOREIGN KEY ("last_sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_registration_tokens" ADD CONSTRAINT "hospital_registration_tokens_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "cases_assigned_hospital_id_idx" ON "cases" USING btree ("assigned_hospital_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "cases_case_number_idx" ON "cases" USING btree ("case_number" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "cases_case_number_key" ON "cases" USING btree ("case_number" text_ops);--> statement-breakpoint
CREATE INDEX "cases_patient_id_idx" ON "cases" USING btree ("patient_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "cases_stage_idx" ON "cases" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "documents_case_id_idx" ON "documents" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "documents_document_type_idx" ON "documents" USING btree ("document_type" enum_ops);--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents" USING btree ("storage_key" text_ops);--> statement-breakpoint
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents" USING btree ("uploaded_by_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_case_id_idx" ON "audit_logs" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_document_id_idx" ON "audit_logs" USING btree ("document_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_event_idx" ON "audit_logs" USING btree ("event" enum_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_hospital_id_idx" ON "audit_logs" USING btree ("hospital_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "case_progress_case_id_idx" ON "case_progress" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "case_progress_progress_type_idx" ON "case_progress" USING btree ("progress_type" enum_ops);--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "users_hospital_id_idx" ON "users" USING btree ("hospital_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_patient_code_key" ON "users" USING btree ("patient_code" text_ops);--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_ai_summary" ON "messages" USING btree ("id" uuid_ops) WHERE (ai_summary IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_time" ON "messages" USING btree ("conversation_id" uuid_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "hospitals_status_idx" ON "hospitals" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "hospitals_type_idx" ON "hospitals" USING btree ("type" enum_ops);--> statement-breakpoint
CREATE INDEX "consultations_case_id_idx" ON "consultations" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "consultations_hospital_id_idx" ON "consultations" USING btree ("hospital_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "consultations_patient_id_idx" ON "consultations" USING btree ("patient_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "consultations_scheduled_at_idx" ON "consultations" USING btree ("scheduled_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "consultations_status_idx" ON "consultations" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_consultations_translation_scheduled" ON "consultations" USING btree ("hospital_id" uuid_ops) WHERE ((ai_translation = true) AND (status = 'SCHEDULED'::"ConsultationStatus"));--> statement-breakpoint
CREATE INDEX "idx_consultation_transcripts_status" ON "consultation_transcripts" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_translation_tasks_created_at" ON "translation_tasks" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_translation_tasks_entity" ON "translation_tasks" USING btree ("entity_type" text_ops,"entity_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_translation_tasks_hospital_type" ON "translation_tasks" USING btree ("hospital_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_translation_tasks_pending" ON "translation_tasks" USING btree ("status" text_ops,"created_at" timestamptz_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_translation_tasks_status" ON "translation_tasks" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "conversations_case_id_idx" ON "conversations" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "conversations_category_idx" ON "conversations" USING btree ("category" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_hospital_category_time" ON "conversations" USING btree ("hospital_id" uuid_ops,"category" enum_ops,"last_message_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "hospital_registration_tokens_expires_at_idx" ON "hospital_registration_tokens" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "hospital_registration_tokens_hospital_id_idx" ON "hospital_registration_tokens" USING btree ("hospital_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "hospital_registration_tokens_token_idx" ON "hospital_registration_tokens" USING btree ("token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "hospital_registration_tokens_token_key" ON "hospital_registration_tokens" USING btree ("token" text_ops);--> statement-breakpoint
CREATE POLICY "Admins can manage all consultation transcripts" ON "consultation_transcripts" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'ADMIN'::"UserRole")))));--> statement-breakpoint
CREATE POLICY "Hospital users can view their consultation transcripts" ON "consultation_transcripts" AS PERMISSIVE FOR SELECT TO public;
*/