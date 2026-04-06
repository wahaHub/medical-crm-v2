export interface HospitalContactLike {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  subStatus: string;
  selectedByPatientAt: string | null;
  distributedAt: string | null;
  quoteId: string | null;
  patientAcceptedAt: string | null;
  patientRejectedAt: string | null;
  reminderSentAt: string | null;
  removedAt: string | null;
}

export interface SelectedHospitalSummary {
  contactId: string;
  hospitalId: string;
  hospitalName: string;
  statusLabel: 'Selected' | 'Quote Prompt Sent' | 'Quoted' | 'Accepted' | 'Rejected';
  hasFollowUpSent: boolean;
}

function isPatientSelected(contact: HospitalContactLike): boolean {
  return Boolean(contact.selectedByPatientAt) && !contact.removedAt;
}

function deriveStatusLabel(contact: HospitalContactLike): SelectedHospitalSummary['statusLabel'] {
  if (contact.patientAcceptedAt) return 'Accepted';
  if (contact.patientRejectedAt) return 'Rejected';
  if (contact.quoteId || contact.subStatus === 'QUOTED') return 'Quoted';
  if (contact.reminderSentAt) return 'Quote Prompt Sent';
  return 'Selected';
}

export function deriveSelectedHospitals(
  contacts: HospitalContactLike[],
  hospitalNameMap: Record<string, string>,
): SelectedHospitalSummary[] {
  return contacts
    .filter(isPatientSelected)
    .map((contact) => ({
      contactId: contact.id,
      hospitalId: contact.hospitalId,
      hospitalName: contact.hospitalName ?? hospitalNameMap[contact.hospitalId] ?? contact.hospitalId,
      statusLabel: deriveStatusLabel(contact),
      hasFollowUpSent: Boolean(contact.reminderSentAt),
    }));
}

export function collectQuoteRequestTargets(contacts: HospitalContactLike[]): string[] {
  return contacts
    .filter((contact) => (
      isPatientSelected(contact)
      && !contact.quoteId
      && !contact.patientAcceptedAt
      && !contact.patientRejectedAt
    ))
    .map((contact) => contact.id);
}
