export interface OrderDTO {
  id: string;
  orderNumber: string;
  patientId: string;
  caseId: string | null;
  packageId: string | null;
  type: string;
  amount: string;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  completedAt: string | null;
  refundedAmount: string | null;
  refundReason: string | null;
  metadata: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
}
