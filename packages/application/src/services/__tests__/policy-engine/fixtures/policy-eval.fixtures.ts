export interface PolicyEvalFixture {
  id: string;
  bucket: string;
  userMessage: string;
  hospitalType?: 'REGULAR' | 'COSMETIC';
  statusSnapshot: {
    docUploadStatus: string;
    packageStatus: string;
    recommendationStatus: string;
    riskLevel: string;
    selectedHospitalId?: string | null;
    consultationStatus?: string;
  };
  pendingOffer?: {
    type: string;
    payload?: Record<string, unknown>;
  } | null;
  activeHospitalContext?: {
    hospitalId: string;
    hospitalName?: string;
    source: string;
  } | null;
  extraction?: Record<string, unknown>;
  candidateHospitals?: Array<{
    hospitalId: string;
    reasonCodes: string[];
  }>;
  requestedHuman?: boolean;
  trustRecovery?: boolean;
  simulate?: {
    decideTimeout?: boolean;
    retrievalTimeout?: boolean;
    writebackFailure?: boolean;
    malformedExtraction?: boolean;
    malformedToolPayload?: boolean;
    handoffCreationFailure?: boolean;
  };
  expected: {
    resolvedIntent?: string;
    riskLevel?: string;
    nextAction?: string;
    handoffRequired?: boolean;
    shortlistLength?: number;
    safeFallback?: string | null;
    writebackRetrySafe?: boolean;
    operatorRetryNeeded?: boolean;
  };
}

function buildCanonicalExtraction(overrides: Record<string, unknown> = {}) {
  return {
    resolvedIntent: 'GENERAL_INFO',
    engagementSignal: 'LIGHT_DISCOVERY',
    progressionSignal: 'NONE',
    recommendationSignal: 'NONE',
    mentionsCondition: false,
    mentionsDoctorOrHospitalNeed: false,
    ...overrides,
  };
}

export function buildFaqFixture(): PolicyEvalFixture {
  return {
    id: 'faq-grounded',
    bucket: 'FAQ',
    userMessage: 'What is the consultation process for cosmetic treatment?',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction(),
    expected: {
      resolvedIntent: 'GENERAL_INFO',
      riskLevel: 'LOW',
      nextAction: 'ANSWER_FAQ',
      handoffRequired: false,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}

export function buildPendingOfferFixture(): PolicyEvalFixture {
  return {
    id: 'history-aware-pending-offer',
    bucket: 'History-aware Intent',
    userMessage: 'yes, show me',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    pendingOffer: {
      type: 'HOSPITAL_RECOMMENDATION',
      payload: { shortlistId: 'rec-1' },
    },
    hospitalType: 'COSMETIC',
    activeHospitalContext: {
      hospitalId: 'hospital-1',
      hospitalName: 'Hospital 1',
      source: 'selected_hospital',
    },
    extraction: buildCanonicalExtraction({
      engagementSignal: 'QUALIFIED_EXPLORATION',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'READY_FOR_RECOMMENDATION',
    }),
    candidateHospitals: [
      { hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] },
      { hospitalId: 'hospital-2', reasonCodes: ['language_supported'] },
    ],
    expected: {
      resolvedIntent: 'ACCEPT_HOSPITAL_RECOMMENDATION',
      riskLevel: 'LOW',
      nextAction: 'SHOW_PACKAGE',
      handoffRequired: false,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}

export function buildRecommendationFixture(): PolicyEvalFixture {
  return {
    id: 'hospital-recommendation-eligibility',
    bucket: 'Hospital Recommendation',
    userMessage: 'Can you recommend a hospital for my case?',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'READY_FOR_RECOMMENDATION',
      mentionsDoctorOrHospitalNeed: true,
    }),
    candidateHospitals: [
      { hospitalId: 'hospital-1', reasonCodes: ['condition_fit', 'language_supported'] },
      { hospitalId: 'hospital-2', reasonCodes: ['destination_match'] },
    ],
    expected: {
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      riskLevel: 'LOW',
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      handoffRequired: false,
      shortlistLength: 2,
      safeFallback: null,
    },
  };
}

export function buildRequestDocsFixture(): PolicyEvalFixture {
  return {
    id: 'request-docs',
    bucket: 'Writeback',
    userMessage: 'What files do you need and can I upload them now?',
    statusSnapshot: {
      docUploadStatus: 'NOT_STARTED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      mentionsCondition: true,
    }),
    expected: {
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      riskLevel: 'LOW',
      nextAction: 'REQUEST_DOC_UPLOAD',
      handoffRequired: false,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}

export function buildTrustRecoveryFixture(): PolicyEvalFixture {
  return {
    id: 'trust-recovery-handoff',
    bucket: 'Human Handoff',
    userMessage: 'I do not trust this. I want to speak to a real person now.',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    requestedHuman: true,
    trustRecovery: true,
    extraction: buildCanonicalExtraction(),
    expected: {
      resolvedIntent: 'GENERAL_INFO',
      riskLevel: 'LOW',
      nextAction: 'ANSWER_FAQ',
      handoffRequired: true,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}

export function buildSafetyFixture(): PolicyEvalFixture {
  return {
    id: 'crisis-override',
    bucket: 'Risk / Safety',
    userMessage: "I don't want to live anymore.",
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'GENERAL_INFO',
      engagementSignal: 'LIGHT_DISCOVERY',
    }),
    candidateHospitals: [
      { hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] },
    ],
    expected: {
      resolvedIntent: 'GENERAL_INFO',
      riskLevel: 'CRISIS',
      nextAction: 'SAFETY_HANDOFF',
      handoffRequired: true,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}

export function buildMalformedExtractionFixture(): PolicyEvalFixture {
  return {
    id: 'malformed-extraction',
    bucket: 'Failure / Recovery',
    userMessage: 'Can you help me?',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: {
      possibleRisk: ['bad-payload'],
      affirmative: 'yes',
    },
    simulate: {
      malformedExtraction: true,
    },
    expected: {
      resolvedIntent: 'UNKNOWN',
      riskLevel: 'LOW',
      nextAction: 'ANSWER_FAQ',
      handoffRequired: false,
      safeFallback: null,
    },
  };
}

export function buildRetrievalTimeoutFixture(): PolicyEvalFixture {
  return {
    id: 'retrieval-timeout',
    bucket: 'Failure / Recovery',
    userMessage: 'Can you recommend a hospital for my case?',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'READY_FOR_RECOMMENDATION',
      mentionsDoctorOrHospitalNeed: true,
    }),
    simulate: {
      retrievalTimeout: true,
    },
    expected: {
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      riskLevel: 'LOW',
      safeFallback: 'RETRIEVAL_TIMEOUT',
      handoffRequired: true,
      nextAction: 'HUMAN_HANDOFF',
      writebackRetrySafe: true,
    },
  };
}

export function buildWritebackFailureFixture(): PolicyEvalFixture {
  return {
    id: 'writeback-failure',
    bucket: 'Failure / Recovery',
    userMessage: 'What files do you need?',
    statusSnapshot: {
      docUploadStatus: 'NOT_STARTED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      mentionsCondition: true,
    }),
    simulate: {
      writebackFailure: true,
    },
    expected: {
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
      riskLevel: 'LOW',
      nextAction: 'REQUEST_DOC_UPLOAD',
      safeFallback: 'WRITEBACK_FAILED',
      writebackRetrySafe: true,
      operatorRetryNeeded: true,
    },
  };
}

export function buildZeroShortlistFixture(): PolicyEvalFixture {
  return {
    id: 'zero-shortlist',
    bucket: 'Failure / Recovery',
    userMessage: 'Can you recommend a hospital for me?',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
      selectedHospitalId: null,
    },
    candidateHospitals: [],
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      engagementSignal: 'DEEP_WORKFLOW',
      progressionSignal: 'READY_TO_PROCEED',
      recommendationSignal: 'READY_FOR_RECOMMENDATION',
      mentionsDoctorOrHospitalNeed: true,
    }),
    expected: {
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
      riskLevel: 'LOW',
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      shortlistLength: 0,
      handoffRequired: false,
      safeFallback: null,
    },
  };
}

export function buildHandoffFailureFixture(): PolicyEvalFixture {
  return {
    id: 'handoff-failure',
    bucket: 'Failure / Recovery',
    userMessage: 'Please connect me with a real person now.',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    extraction: buildCanonicalExtraction({
      resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
      engagementSignal: 'QUALIFIED_EXPLORATION',
    }),
    simulate: {
      handoffCreationFailure: true,
    },
    expected: {
      resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
      riskLevel: 'LOW',
      nextAction: 'HUMAN_HANDOFF',
      handoffRequired: true,
      safeFallback: 'HANDOFF_FAILED',
      operatorRetryNeeded: true,
      writebackRetrySafe: true,
    },
  };
}

export function buildVagueAffirmationFixture(): PolicyEvalFixture {
  return {
    id: 'vague-affirmation',
    bucket: 'Objection Handling',
    userMessage: 'maybe later',
    statusSnapshot: {
      docUploadStatus: 'UPLOADED',
      packageStatus: 'NOT_SHOWN',
      recommendationStatus: 'NOT_SHOWN',
      riskLevel: 'LOW',
    },
    pendingOffer: {
      type: 'HOSPITAL_RECOMMENDATION',
      payload: { shortlistId: 'rec-1' },
    },
    extraction: {
      affirmative: true,
    },
    expected: {
      resolvedIntent: 'UNKNOWN',
      handoffRequired: false,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}
