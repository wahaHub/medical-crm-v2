export interface GetIntakeTemplateInput {
  caseId: string;
}

export interface IntakeQuestion {
  id: string;
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'date';
  required: boolean;
  options?: string[];
}

export interface IntakeTemplate {
  caseId: string;
  questions: IntakeQuestion[];
}

/** Stub: returns a default intake template. Will be replaced with DB-backed templates. */
export class GetIntakeTemplateUseCase {
  async execute(input: GetIntakeTemplateInput): Promise<IntakeTemplate> {
    return {
      caseId: input.caseId,
      questions: [
        { id: 'q1', label: 'What is your main concern?', type: 'text', required: true },
        { id: 'q2', label: 'Do you have any allergies?', type: 'text', required: false },
        { id: 'q3', label: 'Previous surgeries or treatments?', type: 'text', required: false },
        { id: 'q4', label: 'Preferred treatment timeline', type: 'select', required: true, options: ['1-3 months', '3-6 months', '6+ months', 'Flexible'] },
      ],
    };
  }
}
