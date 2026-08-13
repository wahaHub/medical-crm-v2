export interface CaseDiseaseInput {
  caseId: string;
  text: string;
}

export interface ICaseDiseaseSummarizer {
  summarize(inputs: CaseDiseaseInput[]): Promise<Record<string, string>>;
}
