import { describe, expect, it } from 'vitest';
import { RequestClassifierService } from '../../chatbot-v2/request-classifier.service.js';

describe('RequestClassifierService', () => {
  const service = new RequestClassifierService();

  it('classifies broad process questions as process_explanation requests', () => {
    expect(service.classify({
      userMessage: 'Can you explain how the process works?',
    })).toEqual({
      requestClass: 'process_explanation',
      targetResourceTypes: ['PROCESS_GUIDE'],
    });
  });

  it('classifies explicit progression asks as progression_request', () => {
    expect(service.classify({
      userMessage: 'I am ready to continue. What is the next step?',
    })).toEqual({
      requestClass: 'progression_request',
      targetResourceTypes: [],
    });
  });

  it('classifies questionnaire asks as resource_request with the matching v2 resource', () => {
    expect(service.classify({
      userMessage: 'Please open the questionnaire for me.',
    })).toEqual({
      requestClass: 'resource_request',
      targetResourceTypes: ['QUESTIONNAIRE'],
    });
  });

  it('does not treat information requests as questionnaire requests because of substring matches', () => {
    expect(service.classify({
      userMessage: 'I need information about recovery time.',
    })).toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
    });
  });

  it('classifies invitation status asks as resource_status_question', () => {
    expect(service.classify({
      userMessage: 'What is the status of my medical invitation?',
    })).toEqual({
      requestClass: 'resource_status_question',
      targetResourceTypes: ['MEDICAL_INVITATION_STATUS'],
    });
  });

  it('does not treat hospitality support requests as hospital recommendations', () => {
    expect(service.classify({
      userMessage: 'Do you provide hospitality support?',
    })).toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
    });
  });

  it('classifies human-support requests directly as human_help_request', () => {
    expect(service.classify({
      userMessage: 'I need to talk to a human care advisor.',
    })).toEqual({
      requestClass: 'human_help_request',
      targetResourceTypes: ['HUMAN_HANDOFF'],
    });
  });

  it('does not treat Chinese symptom narratives containing 开始 as progression requests', () => {
    expect(service.classify({
      userMessage: '我最近开始头疼，想了解一下怎么治疗。',
    })).toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
    });
  });

  it('does not treat generic Chinese hospital info requests as status questions', () => {
    expect(service.classify({
      userMessage: '我想查看一下医院介绍。',
    })).toEqual({
      requestClass: 'resource_request',
      targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
    });
  });

  it('maps legacy resolved intents onto the new v2 request classes for bridge callers', () => {
    expect(service.classify({
      userMessage: 'legacy bridge',
      resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
    })).toEqual({
      requestClass: 'human_help_request',
      targetResourceTypes: ['HUMAN_HANDOFF'],
    });
  });

  it('bridges ACCEPT_DOC_UPLOAD legacy intents to MEDICAL_DOC_UPLOAD resource requests', () => {
    expect(service.classify({
      userMessage: 'legacy bridge',
      resolvedIntent: 'ACCEPT_DOC_UPLOAD',
    })).toEqual({
      requestClass: 'resource_request',
      targetResourceTypes: ['MEDICAL_DOC_UPLOAD'],
    });
  });

  it('falls back to faq when the request is informational but not process or resource specific', () => {
    expect(service.classify({
      userMessage: 'What should I know about recovery time?',
    })).toEqual({
      requestClass: 'faq',
      targetResourceTypes: [],
    });
  });
});
