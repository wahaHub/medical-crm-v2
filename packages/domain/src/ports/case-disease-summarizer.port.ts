export interface CaseDiseaseInput {
  caseId: string;
  text: string;
  phone?: string | null;
  fallbackCountry?: string | null;
}

export interface CaseListLabel {
  disease: string | null;
  country: string | null;
}

export interface ICaseDiseaseSummarizer {
  summarize(inputs: CaseDiseaseInput[]): Promise<Record<string, CaseListLabel>>;
}
