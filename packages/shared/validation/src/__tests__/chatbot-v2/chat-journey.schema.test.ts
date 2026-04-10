import { describe, expect, it } from 'vitest';
import {
  ChatAssistantEnvelopeSchema,
  ChatResourceDescriptorSchema,
  ChatResourceStaleErrorSchema,
  ChatResourceStatusSchema,
  JourneyPhaseSchema,
  JourneySnapshotSchema,
  JourneyStageSchema,
} from '../../chatbot-v2/chat-journey.schema';

describe('chatbot-v2 journey schemas', () => {
  it('accepts the canonical journey stages and phases', () => {
    expect(JourneyStageSchema.safeParse('EXPLAIN_PROCESS').success).toBe(true);
    expect(JourneyStageSchema.safeParse('COLLECT_MEDICAL_INPUTS').success).toBe(true);
    expect(JourneyStageSchema.safeParse('RECOMMENDATION').success).toBe(true);
    expect(JourneyStageSchema.safeParse('ONLINE_CONSULT').success).toBe(true);
    expect(JourneyStageSchema.safeParse('HUMAN_HANDOFF').success).toBe(true);
    expect(JourneyStageSchema.safeParse('QUESTIONNAIRE').success).toBe(false);

    expect(JourneyPhaseSchema.safeParse('active').success).toBe(true);
    expect(JourneyPhaseSchema.safeParse('pre').success).toBe(true);
    expect(JourneyPhaseSchema.safeParse('post').success).toBe(true);
    expect(JourneyPhaseSchema.safeParse('draft').success).toBe(false);
  });

  it('accepts progression and query resources with the simplified resource statuses', () => {
    expect(ChatResourceStatusSchema.safeParse('available').success).toBe(true);
    expect(ChatResourceStatusSchema.safeParse('submitted').success).toBe(true);
    expect(ChatResourceStatusSchema.safeParse('failed').success).toBe(true);
    expect(ChatResourceStatusSchema.safeParse('confirmed').success).toBe(false);

    expect(ChatResourceDescriptorSchema.safeParse({
      resourceType: 'QUESTIONNAIRE',
      resourceId: 'questionnaire:case-1',
      status: 'available',
      stageBinding: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      visibility: {
        mode: 'journey',
      },
      payload: {
        templateId: 'template-1',
        title: 'Complete your questionnaire',
      },
      actions: ['open', 'submit'],
    }).success).toBe(true);

    expect(ChatResourceDescriptorSchema.safeParse({
      resourceType: 'MEDICAL_INVITATION_STATUS',
      resourceId: 'invitation:case-1',
      status: 'available',
      visibility: {
        mode: 'global',
      },
      payload: {
        invitationStatus: 'PENDING',
      },
      actions: ['refresh'],
    }).success).toBe(true);

    expect(ChatResourceDescriptorSchema.safeParse({
      resourceType: 'QUESTIONNAIRE',
      resourceId: 'questionnaire:case-1',
      status: 'available',
      visibility: {
        mode: 'journey',
      },
      payload: {
        templateId: 'template-1',
      },
      actions: ['open'],
    }).success).toBe(false);
  });

  it('accepts the assistant envelope with journey snapshot and resources', () => {
    expect(ChatAssistantEnvelopeSchema.safeParse({
      text: 'We can start by explaining the process, then collect your medical inputs.',
      resources: [{
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:case-1',
        status: 'available',
        stageBinding: {
          stage: 'EXPLAIN_PROCESS',
          phase: 'active',
        },
        visibility: {
          mode: 'journey',
        },
        payload: {
          title: 'Understand the consultation flow',
        },
        actions: ['open'],
      }],
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      metadata: {
        responseIntent: 'process_explanation',
      },
    }).success).toBe(true);
  });

  it('accepts the stale-resource error payload used by resource updates', () => {
    expect(ChatResourceStaleErrorSchema.safeParse({
      code: 'STALE_RESOURCE',
      message: 'This recommendation card is no longer current.',
      resource: {
        resourceType: 'HOSPITAL_RECOMMENDATION',
        resourceId: 'recommendation:case-1',
        status: 'available',
        stageBinding: {
          stage: 'RECOMMENDATION',
          phase: 'active',
        },
        visibility: {
          mode: 'journey',
        },
        payload: {
          recommendationKind: 'hospital',
        },
        actions: ['open', 'submit'],
      },
      journeySnapshot: JourneySnapshotSchema.parse({
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      }),
    }).success).toBe(true);
  });
});
