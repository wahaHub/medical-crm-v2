export interface HandoffPolicyInput {
  riskLevel?: string;
  nextAction?: string;
  requestedHuman?: boolean;
  trustRecovery?: boolean;
}

export interface HandoffPolicyDecision {
  required: boolean;
  handoffType: string | null;
  priority: string | null;
  reasonCode: string | null;
}

export class HandoffPolicyService {
  decide(input: HandoffPolicyInput): HandoffPolicyDecision {
    const riskLevel = normalize(input.riskLevel);
    if (riskLevel === 'CRISIS' || input.nextAction === 'SAFETY_HANDOFF') {
      return {
        required: true,
        handoffType: 'SAFETY_ESCALATION',
        priority: 'HIGH',
        reasonCode: 'crisis_override',
      };
    }

    if (input.requestedHuman) {
      return {
        required: true,
        handoffType: 'REQUESTED_HUMAN',
        priority: 'MEDIUM',
        reasonCode: 'user_requested_human',
      };
    }

    if (input.trustRecovery) {
      return {
        required: true,
        handoffType: 'TRUST_RECOVERY',
        priority: 'MEDIUM',
        reasonCode: 'trust_recovery_needed',
      };
    }

    return {
      required: false,
      handoffType: null,
      priority: null,
      reasonCode: null,
    };
  }
}

function normalize(value: string | undefined): string {
  return (value ?? '').toUpperCase();
}
