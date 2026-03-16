-- Module 3: Support Tickets

CREATE TYPE "TicketType" AS ENUM ('ACCOUNT_ISSUES', 'PAYMENT_PROBLEMS', 'HOSPITAL_COMMUNICATION', 'DOCUMENT_HELP', 'VISA_TRAVEL', 'GENERAL_QUESTIONS', 'FEEDBACK');
CREATE TYPE "TicketPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'PENDING_INFO', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketReplyRole" AS ENUM ('ADMIN', 'PATIENT');

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  type "TicketType" NOT NULL,
  priority "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  status "TicketStatus" NOT NULL DEFAULT 'OPEN',
  subject VARCHAR(500),
  description TEXT NOT NULL,
  source_page VARCHAR(200),
  assigned_to UUID REFERENCES users(id),
  sla_deadline TIMESTAMPTZ,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  author_role "TicketReplyRole" NOT NULL,
  content TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_patient_status ON support_tickets(patient_id, status, created_at DESC);
CREATE INDEX idx_tickets_queue ON support_tickets(status, priority, sla_deadline ASC NULLS LAST, created_at DESC);
CREATE INDEX idx_ticket_replies_ticket ON support_ticket_replies(ticket_id, created_at DESC);
CREATE INDEX idx_tickets_assigned_status ON support_tickets(assigned_to, status) WHERE assigned_to IS NOT NULL;
