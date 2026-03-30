import type { AiPolicyBackendNextAction } from '../../dtos/ai-policy.dto.js';

export interface RiskResolverInput {
  userMessage: string;
  candidateSignals?: Record<string, unknown>;
}

export interface RiskResolution {
  riskLevel: string;
  overrideAction: AiPolicyBackendNextAction | null;
  reasonCodes: string[];
}

const CRISIS_PATTERNS = [
  /hurt myself/i,
  /kill myself/i,
  /don't want to live/i,
  /suicide/i,
  /end my life/i,
];

export class RiskResolverService {
  async resolve(input: RiskResolverInput): Promise<RiskResolution> {
    const possibleRisk = normalizeRisk(input.candidateSignals?.['possibleRisk']);
    const userMessage = input.userMessage;

    if (possibleRisk === 'CRISIS' || CRISIS_PATTERNS.some((pattern) => pattern.test(userMessage))) {
      return {
        riskLevel: 'CRISIS',
        overrideAction: 'SAFETY_HANDOFF',
        reasonCodes: ['crisis_signal_detected'],
      };
    }

    if (possibleRisk === 'HIGH_RISK' || possibleRisk === 'HIGH') {
      return {
        riskLevel: 'HIGH_RISK',
        overrideAction: 'SAFETY_HANDOFF',
        reasonCodes: ['high_risk_signal_detected'],
      };
    }

    if (possibleRisk === 'SENSITIVE') {
      return {
        riskLevel: 'SENSITIVE',
        overrideAction: null,
        reasonCodes: ['sensitive_signal_detected'],
      };
    }

    return {
      riskLevel: 'LOW',
      overrideAction: null,
      reasonCodes: ['no_risk_override'],
    };
  }
}

function normalizeRisk(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : null;
}
