export interface PatientDashboardDTO {
  cases: Array<{
    id: string;
    caseNumber: string;
    assignmentStatus: string;
    treatmentStage: string | null;
  }>;
  upcomingMilestones: Array<{
    id: string;
    eventType: string;
    eventDate: string;
    note: string | null;
  }>;
  ordersSummary: {
    pendingPayment: number;
    inProgress: number;
    completed: number;
  };
  unreadMessageCount: number;
}

export interface AdminDashboardDTO {
  stats: {
    totalCases: number;
    unassignedCases: number;
    assignedCases: number;
    openTickets: number;
    pendingOrders: number;
  };
  recentCases: Array<{
    id: string;
    caseNumber: string;
    assignmentStatus: string;
    createdAt: string;
  }>;
}

export interface HospitalDashboardDTO {
  stats: {
    assignedCases: number;
    pendingQuotes: number;
    todayConsultations: number;
    activeOrders: number;
  };
  recentCases: Array<{
    id: string;
    caseNumber: string;
    treatmentStage: string | null;
    createdAt: string;
  }>;
}
