export interface VideoConsultation {
  id: string;
  case_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_email: string | null;
  room_name: string;
  status: 'PENDING_CONFIRMATION' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  scheduled_at: string | null;
  title: string | null;
  description: string | null;
  host_identity: string | null;
  timezone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  duration_minutes: number;
  doctor_response_at: string | null;
  doctor_response_note: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface VideoConsultationListResponse {
  success: boolean;
  consultations: VideoConsultation[];
  error?: string;
}

export interface VideoConsultationUpdateResponse {
  success: boolean;
  consultation: VideoConsultation;
  error?: string;
}

export interface LiveKitTokenResponse {
  success: boolean;
  token: string;
  livekitUrl: string;
  identity: string;
  roomName: string;
  error?: string;
}
