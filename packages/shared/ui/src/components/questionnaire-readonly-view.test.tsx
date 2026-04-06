import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionnaireReadonlyView } from './questionnaire-readonly-view';

const defaultTemplate = {
  id: 'tmpl-default',
  questions: {
    steps: [
      {
        id: 'step_triage',
        title: 'Quick Triage & Classification / 初步分诊',
        questions: [
          {
            id: 'primary_location',
            prompt: 'Primary symptom location / 主要不适部位',
            type: 'SINGLE_CHOICE',
            required: true,
            options: ['Right Lower Abdomen / 右下腹'],
          },
          {
            id: 'symptom_nature',
            prompt: 'Symptom nature / 症状性质',
            type: 'MULTI_CHOICE_WITH_TEXT',
            required: true,
            options: ['Dull pain / 隐痛'],
          },
        ],
      },
      {
        id: 'step_present_illness',
        title: 'Present Illness Details / 现病史',
        questions: [
          {
            id: 'detailed_symptoms',
            prompt: 'Detailed symptoms and current problem / 详细症状与当前问题',
            type: 'TEXT',
            required: true,
            options: [],
          },
        ],
      },
    ],
  },
};

describe('QuestionnaireReadonlyView', () => {
  it('renders question-collector responses using template step titles and prompts', () => {
    render(
      <QuestionnaireReadonlyView
        template={defaultTemplate}
        response={{
          responses: {
            primary_location: 'Right Lower Abdomen / 右下腹',
            symptom_nature: ['Dull pain / 隐痛', 'Other custom note'],
            detailed_symptoms: 'Patient reports worsening pain after meals.',
          },
        }}
      />,
    );

    expect(screen.getByText('Quick Triage & Classification / 初步分诊')).toBeTruthy();
    expect(screen.getByText(/Primary symptom location \/ 主要不适部位/)).toBeTruthy();
    expect(screen.getByText('Right Lower Abdomen / 右下腹')).toBeTruthy();
    expect(screen.getByText(/Symptom nature \/ 症状性质/)).toBeTruthy();
    expect(screen.getByText('Other custom note')).toBeTruthy();
    expect(screen.getByText('Present Illness Details / 现病史')).toBeTruthy();
    expect(screen.getByText('Patient reports worsening pain after meals.')).toBeTruthy();
  });

  it('shows the empty state when there is no questionnaire response yet', () => {
    render(<QuestionnaireReadonlyView template={null} response={null} />);

    expect(screen.getByText('No medical intake data')).toBeTruthy();
    expect(screen.getByText('The patient has not completed the medical intake questionnaire yet.')).toBeTruthy();
  });
});
