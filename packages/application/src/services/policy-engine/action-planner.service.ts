export interface ActionPlannerInput {
  statusSnapshot: {
    docUploadStatus?: string;
    packageStatus?: string;
    recommendationStatus?: string;
    riskLevel?: string;
  };
  resolvedIntent: string;
}

export interface ActionPlan {
  nextAction: string;
  secondaryAction: string | null;
  reasonCodes: string[];
}

export class ActionPlannerService {
  plan(input: ActionPlannerInput): ActionPlan {
    const riskLevel = normalize(input.statusSnapshot.riskLevel);
    if (riskLevel === 'CRISIS') {
      return {
        nextAction: 'SAFETY_HANDOFF',
        secondaryAction: null,
        reasonCodes: ['crisis_override'],
      };
    }

    if (
      input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' &&
      normalize(input.statusSnapshot.docUploadStatus) === 'NOT_STARTED'
    ) {
      return {
        nextAction: 'REQUEST_DOC_UPLOAD',
        secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['documents_required_before_recommendation'],
      };
    }

    if (normalize(input.statusSnapshot.packageStatus) === 'NOT_SHOWN') {
      return {
        nextAction: 'SHOW_PACKAGE',
        secondaryAction: null,
        reasonCodes: ['package_not_yet_shown'],
      };
    }

    return {
      nextAction: 'ANSWER_FAQ',
      secondaryAction: null,
      reasonCodes: ['default_answer_path'],
    };
  }
}

function normalize(value: string | undefined): string {
  return (value ?? '').toUpperCase();
}
