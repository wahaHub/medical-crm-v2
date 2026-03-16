export interface BookingRequestHospitalProps {
  id: string;
  bookingRequestId: string;
  hospitalId: string;
  isRecommended: boolean;
  matchScore: number | null;
  recommendationReason: string | null;
  selectedByPatient: boolean;
  selectedAt: Date | null;
}

export class BookingRequestHospital {
  readonly id: string;
  readonly bookingRequestId: string;
  readonly hospitalId: string;
  isRecommended: boolean;
  matchScore: number | null;
  recommendationReason: string | null;
  selectedByPatient: boolean;
  selectedAt: Date | null;

  constructor(props: BookingRequestHospitalProps) {
    this.id = props.id;
    this.bookingRequestId = props.bookingRequestId;
    this.hospitalId = props.hospitalId;
    this.isRecommended = props.isRecommended;
    this.matchScore = props.matchScore;
    this.recommendationReason = props.recommendationReason;
    this.selectedByPatient = props.selectedByPatient;
    this.selectedAt = props.selectedAt;
  }

  select(): void {
    this.selectedByPatient = true;
    this.selectedAt = new Date();
  }

  deselect(): void {
    this.selectedByPatient = false;
    this.selectedAt = null;
  }
}
