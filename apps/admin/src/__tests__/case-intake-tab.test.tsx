import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseIntakeTab } from '../components/tabs/case-intake-tab';

const {
  mockUseCaseQuestionnaire,
  mockUseQuestionTemplate,
  mockQuestionnaireReadonlyView,
} = vi.hoisted(() => ({
  mockUseCaseQuestionnaire: vi.fn(),
  mockUseQuestionTemplate: vi.fn(),
  mockQuestionnaireReadonlyView: vi.fn((props: { template: unknown; response: unknown }) => (
    <div>
      <div data-testid="template-prop">{JSON.stringify(props.template)}</div>
      <div data-testid="response-prop">{JSON.stringify(props.response)}</div>
    </div>
  )),
}));

vi.mock('@/queries/use-cases', () => ({
  useCaseQuestionnaire: mockUseCaseQuestionnaire,
}));

vi.mock('@/queries/use-question-collectors', () => ({
  useQuestionTemplate: mockUseQuestionTemplate,
}));

vi.mock('@medical-crm/ui', () => ({
  LoadingSpinner: () => <div>loading...</div>,
  QuestionnaireReadonlyView: mockQuestionnaireReadonlyView,
}));

describe('CaseIntakeTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the question-collector response payload and matching template into the readonly view', () => {
    mockUseCaseQuestionnaire.mockReturnValue({
      data: {
        id: 'resp-1',
        templateId: 'tmpl-default',
        responses: {
          primary_location: 'Right Lower Abdomen / 右下腹',
        },
      },
      isLoading: false,
      error: null,
    });
    mockUseQuestionTemplate.mockReturnValue({
      data: {
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
                },
              ],
            },
          ],
        },
      },
      isLoading: false,
    });

    const markup = renderToStaticMarkup(<CaseIntakeTab caseId="case-1" />);

    expect(markup).toContain('Quick Triage &amp; Classification');
    expect(markup).toContain('primary_location');
    expect(markup).toContain('Right Lower Abdomen');
  });
});
