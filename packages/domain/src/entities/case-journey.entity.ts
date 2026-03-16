export interface CaseJourneyProps {
  id: string;
  caseId: string;
  visa: unknown | null;
  insurance: unknown | null;
  accommodation: unknown | null;
  transportation: unknown | null;
  postCare: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CaseJourney {
  readonly id: string;
  readonly caseId: string;
  visa: unknown | null;
  insurance: unknown | null;
  accommodation: unknown | null;
  transportation: unknown | null;
  postCare: unknown | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: CaseJourneyProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.visa = props.visa;
    this.insurance = props.insurance;
    this.accommodation = props.accommodation;
    this.transportation = props.transportation;
    this.postCare = props.postCare;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(data: Partial<Pick<CaseJourneyProps, 'visa' | 'insurance' | 'accommodation' | 'transportation' | 'postCare'>>): void {
    if (data.visa !== undefined) this.visa = data.visa;
    if (data.insurance !== undefined) this.insurance = data.insurance;
    if (data.accommodation !== undefined) this.accommodation = data.accommodation;
    if (data.transportation !== undefined) this.transportation = data.transportation;
    if (data.postCare !== undefined) this.postCare = data.postCare;
    this.updatedAt = new Date();
  }
}
