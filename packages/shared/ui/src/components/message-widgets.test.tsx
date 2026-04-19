import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageCaseDetailPanel } from './message-widgets';

describe('MessageCaseDetailPanel', () => {
  it('applies caller-provided labels and formatters', () => {
    render(
      <MessageCaseDetailPanel
        caseId="case-123"
        category="ADMIN_HOSPITAL"
        participantRole="PATIENT"
        participantName=""
        patientCode="PT-001"
        patientAge={42}
        patientGender="F"
        patientLanguage="fr"
        caseStatus="IN_PROGRESS"
        diagnosis="Cardiac evaluation"
        documentCount={3}
        messageCount={8}
        conversationTitle="Follow-up"
        labels={{
          unknownParticipant: 'Unknown localized user',
          conversation: 'Conversation localized',
          patientCode: 'Patient code localized',
          primaryDiagnosis: 'Diagnosis localized',
          language: 'Language localized',
          profile: 'Profile localized',
          caseStatus: 'Status localized',
          stats: 'Stats localized',
          documents: 'Documents localized',
          messages: 'Messages localized',
          role: 'Role localized',
          case: 'Case localized',
          hospital: 'Hospital localized',
        }}
        formatCategoryLabel={() => 'Admin localized'}
        formatLanguageLabel={() => 'French localized'}
        formatStatusLabel={() => 'In progress localized'}
        formatGenderLabel={() => 'Female localized'}
        formatAgeLabel={() => '42 years localized'}
        formatParticipantRoleLabel={() => 'Patient localized'}
      />,
    );

    expect(screen.getByText('Unknown localized user')).toBeTruthy();
    expect(screen.getByText('Conversation localized')).toBeTruthy();
    expect(screen.getByText('Admin localized')).toBeTruthy();
    expect(screen.getByText('French localized')).toBeTruthy();
    expect(screen.getByText('In progress localized')).toBeTruthy();
    expect(screen.getByText('Female localized / 42 years localized')).toBeTruthy();
    expect(screen.getByText('Role localized: Patient localized')).toBeTruthy();
  });
});
