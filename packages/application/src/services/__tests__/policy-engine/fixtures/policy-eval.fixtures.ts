export interface PolicyEvalFixture {
  id: string;
  bucket: string;
  userMessage: string;
  statusSnapshot: {
    docUploadStatus: string;
    packageStatus: string;
    recommendationStatus: string;
    riskLevel: string;
  };
  pendingOffer?: {
    type: string;
    payload?: Record<string, unknown>;
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
    extraction: {
      possibleIntent: 'FAQ',
    },
    expected: {
      resolvedIntent: 'GENERAL_CONSULT',
      riskLevel: 'LOW',
      nextAction: 'SHOW_PACKAGE',
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
    extraction: {
      possibleIntent: 'ASK_FOR_RECOMMENDATION',
    },
    candidateHospitals: [
      { hospitalId: 'hospital-1', reasonCodes: ['condition_fit', 'language_supported'] },
      { hospitalId: 'hospital-2', reasonCodes: ['destination_match'] },
    ],
    expected: {
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
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
    expected: {
      resolvedIntent: 'GENERAL_CONSULT',
      riskLevel: 'LOW',
      nextAction: 'SHOW_PACKAGE',
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
    candidateHospitals: [
      { hospitalId: 'hospital-1', reasonCodes: ['condition_fit'] },
    ],
    expected: {
      resolvedIntent: 'GENERAL_CONSULT',
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
      riskLevel: 'LOW',
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
    simulate: {
      retrievalTimeout: true,
    },
    expected: {
      safeFallback: 'RETRIEVAL_TIMEOUT',
      handoffRequired: true,
      nextAction: 'ESCALATE',
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
    simulate: {
      writebackFailure: true,
    },
    expected: {
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
    },
    candidateHospitals: [],
    expected: {
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
      nextAction: 'SHOW_PACKAGE',
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
    requestedHuman: true,
    simulate: {
      handoffCreationFailure: true,
    },
    expected: {
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
    expected: {
      resolvedIntent: 'GENERAL_CONSULT',
      handoffRequired: false,
      shortlistLength: 0,
      safeFallback: null,
    },
  };
}
