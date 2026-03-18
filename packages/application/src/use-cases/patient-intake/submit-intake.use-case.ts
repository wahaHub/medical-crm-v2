export interface IntakeResponse {
  questionId: string;
  answer: string | string[];
}

export interface SubmitIntakeInput {
  caseId: string;
  patientId: string;
  responses: IntakeResponse[];
}

/** Stub: logs the submission. Will be replaced with DB persistence. */
export class SubmitIntakeUseCase {
  async execute(input: SubmitIntakeInput): Promise<void> {
    console.log(`[STUB] Intake submitted for case ${input.caseId} by patient ${input.patientId}:`, JSON.stringify(input.responses));
  }
}
