export interface PatientConversationSummaryDTO {
  id: string;
  caseId: string | null;
  category: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
  type: 'patient-admin' | 'patient-hospital';
  title: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
  assistantMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER';
  unreadCount: number;
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  lastMessagePreview: string | null;
  updatedAt: string;
}
