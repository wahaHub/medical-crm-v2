import { relations } from "drizzle-orm/relations";
import { hospitals, cases, users, documents, auditLogs, caseProgress, conversations, messages, emailReplyTokens, inboundEmailEvents, consultations, consultationTranscripts, hospitalRegistrationTokens, caseHospitalContacts, quotes, caseEvents, supportTickets, supportTicketReplies, packages, orders, caseJourneys, journeyMilestones, questionCollectorTemplates, questionCollectorResponses, questionCollectorCustomizations, serviceCatalogItems, quoteTemplates, bookingRequests, bookingRequestHospitals } from "./schema";

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
	emailReplyTokens: many(emailReplyTokens),
	inboundEmailEvents: many(inboundEmailEvents),
	caseEvents: many(caseEvents),
}));

export const hospitalsRelations = relations(hospitals, ({many}) => ({
	cases: many(cases),
	users: many(users),
	emailReplyTokens: many(emailReplyTokens),
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
	emailReplyTokens: many(emailReplyTokens),
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
	inboundEmailEvents: many(inboundEmailEvents),
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
	emailReplyTokens: many(emailReplyTokens),
	inboundEmailEvents: many(inboundEmailEvents),
}));

export const emailReplyTokensRelations = relations(emailReplyTokens, ({one, many}) => ({
	conversation: one(conversations, {
		fields: [emailReplyTokens.conversationId],
		references: [conversations.id]
	}),
	case: one(cases, {
		fields: [emailReplyTokens.caseId],
		references: [cases.id]
	}),
	patient: one(users, {
		fields: [emailReplyTokens.patientId],
		references: [users.id]
	}),
	hospital: one(hospitals, {
		fields: [emailReplyTokens.hospitalId],
		references: [hospitals.id]
	}),
	inboundEmailEvents: many(inboundEmailEvents),
}));

export const inboundEmailEventsRelations = relations(inboundEmailEvents, ({one}) => ({
	replyToken: one(emailReplyTokens, {
		fields: [inboundEmailEvents.replyTokenId],
		references: [emailReplyTokens.id]
	}),
	conversation: one(conversations, {
		fields: [inboundEmailEvents.conversationId],
		references: [conversations.id]
	}),
	case: one(cases, {
		fields: [inboundEmailEvents.caseId],
		references: [cases.id]
	}),
	createdMessage: one(messages, {
		fields: [inboundEmailEvents.createdMessageId],
		references: [messages.id]
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

export const packagesRelations = relations(packages, ({one}) => ({
	creator: one(users, { fields: [packages.createdBy], references: [users.id] }),
}));

export const ordersRelations = relations(orders, ({one}) => ({
	patient: one(users, { fields: [orders.patientId], references: [users.id] }),
	case_: one(cases, { fields: [orders.caseId], references: [cases.id] }),
	package_: one(packages, { fields: [orders.packageId], references: [packages.id] }),
}));

// Phase 2 M5: Journey + Milestones
export const caseJourneysRelations = relations(caseJourneys, ({one}) => ({
	case: one(cases, { fields: [caseJourneys.caseId], references: [cases.id] }),
}));

export const journeyMilestonesRelations = relations(journeyMilestones, ({one}) => ({
	case: one(cases, { fields: [journeyMilestones.caseId], references: [cases.id] }),
	createdByUser: one(users, { fields: [journeyMilestones.createdBy], references: [users.id] }),
}));

// Phase 2 M6: QuestionCollector
export const questionCollectorTemplatesRelations = relations(questionCollectorTemplates, ({one, many}) => ({
	creator: one(users, { fields: [questionCollectorTemplates.createdBy], references: [users.id] }),
	responses: many(questionCollectorResponses),
	customizations: many(questionCollectorCustomizations),
}));

export const questionCollectorResponsesRelations = relations(questionCollectorResponses, ({one}) => ({
	case: one(cases, { fields: [questionCollectorResponses.caseId], references: [cases.id] }),
	template: one(questionCollectorTemplates, { fields: [questionCollectorResponses.templateId], references: [questionCollectorTemplates.id] }),
	user: one(users, { fields: [questionCollectorResponses.userId], references: [users.id] }),
}));

export const questionCollectorCustomizationsRelations = relations(questionCollectorCustomizations, ({one}) => ({
	template: one(questionCollectorTemplates, { fields: [questionCollectorCustomizations.templateId], references: [questionCollectorTemplates.id] }),
	hospital: one(hospitals, { fields: [questionCollectorCustomizations.hospitalId], references: [hospitals.id] }),
	customizer: one(users, { fields: [questionCollectorCustomizations.customizedBy], references: [users.id] }),
}));

// Phase 2 M7: ServiceCatalog + QuoteTemplates
export const serviceCatalogItemsRelations = relations(serviceCatalogItems, ({one}) => ({
	hospital: one(hospitals, { fields: [serviceCatalogItems.hospitalId], references: [hospitals.id] }),
}));

export const quoteTemplatesRelations = relations(quoteTemplates, ({one}) => ({
	hospital: one(hospitals, { fields: [quoteTemplates.hospitalId], references: [hospitals.id] }),
}));

// Phase 2 M9: BookingRequest
export const bookingRequestsRelations = relations(bookingRequests, ({one, many}) => ({
	user: one(users, { fields: [bookingRequests.userId], references: [users.id] }),
	bookingRequestHospitals: many(bookingRequestHospitals),
}));

export const bookingRequestHospitalsRelations = relations(bookingRequestHospitals, ({one}) => ({
	bookingRequest: one(bookingRequests, { fields: [bookingRequestHospitals.bookingRequestId], references: [bookingRequests.id] }),
	hospital: one(hospitals, { fields: [bookingRequestHospitals.hospitalId], references: [hospitals.id] }),
}));
