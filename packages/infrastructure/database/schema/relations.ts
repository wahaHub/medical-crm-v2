import { relations } from "drizzle-orm/relations";
import { hospitals, cases, users, documents, auditLogs, caseProgress, conversations, messages, consultations, consultationTranscripts, hospitalRegistrationTokens, caseHospitalContacts, quotes, caseEvents, supportTickets, supportTicketReplies } from "./schema";

export const casesRelations = relations(cases, ({one, many}) => ({
	hospital: one(hospitals, {
		fields: [cases.assignedHospitalId],
		references: [hospitals.id]
	}),
	user: one(users, {
		fields: [cases.patientId],
		references: [users.id]
	}),
	documents: many(documents),
	caseProgresses: many(caseProgress),
	consultations: many(consultations),
	conversations: many(conversations),
	caseEvents: many(caseEvents),
}));

export const hospitalsRelations = relations(hospitals, ({many}) => ({
	cases: many(cases),
	users: many(users),
	hospitalRegistrationTokens: many(hospitalRegistrationTokens),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	cases: many(cases),
	documents: many(documents),
	auditLogs: many(auditLogs),
	hospital: one(hospitals, {
		fields: [users.hospitalId],
		references: [hospitals.id]
	}),
	messages: many(messages),
	consultations: many(consultations),
	conversations: many(conversations),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	case: one(cases, {
		fields: [documents.caseId],
		references: [cases.id]
	}),
	document: one(documents, {
		fields: [documents.sourceDocId],
		references: [documents.id],
		relationName: "documents_sourceDocId_documents_id"
	}),
	documents: many(documents, {
		relationName: "documents_sourceDocId_documents_id"
	}),
	user: one(users, {
		fields: [documents.uploadedById],
		references: [users.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id]
	}),
}));

export const caseProgressRelations = relations(caseProgress, ({one}) => ({
	case: one(cases, {
		fields: [caseProgress.caseId],
		references: [cases.id]
	}),
}));

export const messagesRelations = relations(messages, ({one, many}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id],
		relationName: "messages_conversationId_conversations_id"
	}),
	user: one(users, {
		fields: [messages.senderId],
		references: [users.id]
	}),
	conversations: many(conversations, {
		relationName: "conversations_lastMessageId_messages_id"
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	messages: many(messages, {
		relationName: "messages_conversationId_conversations_id"
	}),
	case: one(cases, {
		fields: [conversations.caseId],
		references: [cases.id]
	}),
	message: one(messages, {
		fields: [conversations.lastMessageId],
		references: [messages.id],
		relationName: "conversations_lastMessageId_messages_id"
	}),
	user: one(users, {
		fields: [conversations.lastSenderId],
		references: [users.id]
	}),
}));

export const consultationsRelations = relations(consultations, ({one, many}) => ({
	case: one(cases, {
		fields: [consultations.caseId],
		references: [cases.id]
	}),
	user: one(users, {
		fields: [consultations.patientId],
		references: [users.id]
	}),
	consultationTranscripts: many(consultationTranscripts),
}));

export const consultationTranscriptsRelations = relations(consultationTranscripts, ({one}) => ({
	consultation: one(consultations, {
		fields: [consultationTranscripts.consultationId],
		references: [consultations.id]
	}),
}));

export const hospitalRegistrationTokensRelations = relations(hospitalRegistrationTokens, ({one}) => ({
	hospital: one(hospitals, {
		fields: [hospitalRegistrationTokens.hospitalId],
		references: [hospitals.id]
	}),
}));

export const caseHospitalContactsRelations = relations(caseHospitalContacts, ({one}) => ({
	case: one(cases, {
		fields: [caseHospitalContacts.caseId],
		references: [cases.id]
	}),
	hospital: one(hospitals, {
		fields: [caseHospitalContacts.hospitalId],
		references: [hospitals.id]
	}),
	quote: one(quotes, {
		fields: [caseHospitalContacts.quoteId],
		references: [quotes.id]
	}),
}));

export const quotesRelations = relations(quotes, ({one, many}) => ({
	case: one(cases, {
		fields: [quotes.caseId],
		references: [cases.id]
	}),
	hospital: one(hospitals, {
		fields: [quotes.hospitalId],
		references: [hospitals.id]
	}),
	createdByUser: one(users, {
		fields: [quotes.createdBy],
		references: [users.id]
	}),
	caseHospitalContacts: many(caseHospitalContacts),
}));

export const caseEventsRelations = relations(caseEvents, ({one}) => ({
	case: one(cases, {
		fields: [caseEvents.caseId],
		references: [cases.id]
	}),
}));

export const supportTicketsRelations = relations(supportTickets, ({one, many}) => ({
	patient: one(users, {
		fields: [supportTickets.patientId],
		references: [users.id],
		relationName: "supportTickets_patientId_users_id"
	}),
	case: one(cases, {
		fields: [supportTickets.caseId],
		references: [cases.id]
	}),
	assignee: one(users, {
		fields: [supportTickets.assignedTo],
		references: [users.id],
		relationName: "supportTickets_assignedTo_users_id"
	}),
	replies: many(supportTicketReplies),
}));

export const supportTicketRepliesRelations = relations(supportTicketReplies, ({one}) => ({
	ticket: one(supportTickets, {
		fields: [supportTicketReplies.ticketId],
		references: [supportTickets.id]
	}),
	author: one(users, {
		fields: [supportTicketReplies.authorId],
		references: [users.id]
	}),
}));