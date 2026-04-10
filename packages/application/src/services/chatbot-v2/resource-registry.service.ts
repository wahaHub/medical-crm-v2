import type { ChatResourceType } from '@medical-crm/domain';
import type { ChatbotV2ResourceDescriptor, ResourceRegistryInput } from './types.js';

type ResourceDefinition = {
  resourceType: ChatResourceType;
  resourceId: (input: ResourceRegistryInput) => string;
  stageBinding?: ChatbotV2ResourceDescriptor['stageBinding'];
  visibility: ChatbotV2ResourceDescriptor['visibility'];
  status: (input: ResourceRegistryInput) => ChatbotV2ResourceDescriptor['status'];
  payload: (input: ResourceRegistryInput) => Record<string, unknown>;
  actions: string[];
};

export class ResourceRegistryService {
  private readonly resourceDefinitions: Record<ChatResourceType, ResourceDefinition> = {
    PROCESS_GUIDE: {
      resourceType: 'PROCESS_GUIDE',
      resourceId: (input) => this.buildScopedResourceId('process-guide', input),
      stageBinding: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      visibility: { mode: 'global' },
      status: () => 'available',
      payload: () => ({
        title: 'Understand our consultation process',
      }),
      actions: ['open'],
    },
    MEDICAL_DOC_UPLOAD: {
      resourceType: 'MEDICAL_DOC_UPLOAD',
      resourceId: (input) => this.buildScopedResourceId('medical-doc-upload', input),
      stageBinding: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      visibility: { mode: 'journey' },
      status: ({ truth }) => truth.medicalInputsSubmitted ? 'submitted' : 'available',
      payload: () => ({
        title: 'Upload your medical records',
      }),
      actions: ['open', 'submit'],
    },
    QUESTIONNAIRE: {
      resourceType: 'QUESTIONNAIRE',
      resourceId: (input) => this.buildScopedResourceId('questionnaire', input),
      stageBinding: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
      visibility: { mode: 'journey' },
      status: ({ truth }) => truth.medicalInputsSubmitted ? 'submitted' : 'available',
      payload: () => ({
        title: 'Complete your medical questionnaire',
      }),
      actions: ['open', 'submit'],
    },
    HOSPITAL_RECOMMENDATION: {
      resourceType: 'HOSPITAL_RECOMMENDATION',
      resourceId: (input) => this.buildScopedResourceId('hospital-recommendation', input),
      stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
      visibility: { mode: 'journey' },
      status: ({ truth }) => truth.recommendationConfirmed ? 'submitted' : 'available',
      payload: () => ({
        recommendationKind: 'hospital',
      }),
      actions: ['open', 'submit'],
    },
    PACKAGE_RECOMMENDATION: {
      resourceType: 'PACKAGE_RECOMMENDATION',
      resourceId: (input) => this.buildScopedResourceId('package-recommendation', input),
      stageBinding: { stage: 'RECOMMENDATION', phase: 'active' },
      visibility: { mode: 'journey' },
      status: ({ truth }) => truth.recommendationConfirmed ? 'submitted' : 'available',
      payload: () => ({
        recommendationKind: 'package',
      }),
      actions: ['open', 'submit'],
    },
    ONLINE_CONSULT_BOOKING: {
      resourceType: 'ONLINE_CONSULT_BOOKING',
      resourceId: (input) => this.buildScopedResourceId('online-consult-booking', input),
      stageBinding: { stage: 'ONLINE_CONSULT', phase: 'active' },
      visibility: { mode: 'journey' },
      status: ({ truth }) => truth.onlineConsultSubmitted ? 'submitted' : 'available',
      payload: () => ({
        title: 'Book an online consultation',
      }),
      actions: ['open', 'submit'],
    },
    HUMAN_HANDOFF: {
      resourceType: 'HUMAN_HANDOFF',
      resourceId: (input) => this.buildScopedResourceId('human-handoff', input),
      stageBinding: { stage: 'HUMAN_HANDOFF', phase: 'active' },
      visibility: { mode: 'global' },
      status: ({ truth }) => truth.humanHandoffSubmitted ? 'submitted' : 'available',
      payload: () => ({
        title: 'Talk to a human care advisor',
      }),
      actions: ['request_human'],
    },
    MEDICAL_INVITATION_STATUS: {
      resourceType: 'MEDICAL_INVITATION_STATUS',
      resourceId: (input) => this.buildScopedResourceId('medical-invitation-status', input),
      visibility: { mode: 'global' },
      status: () => 'available',
      payload: () => ({
        invitationStatus: 'UNKNOWN',
      }),
      actions: ['refresh'],
    },
  };

  listResources(input: ResourceRegistryInput): ChatbotV2ResourceDescriptor[] {
    return Object.values(this.resourceDefinitions)
      .filter((definition) => this.isVisible(definition, input))
      .map((definition) => this.toDescriptor(definition, input));
  }

  resolveResource(input: ResourceRegistryInput & { resourceType: ChatResourceType }): ChatbotV2ResourceDescriptor {
    const definition = this.resourceDefinitions[input.resourceType];
    if (!definition) {
      throw new Error(`Unknown resource type: ${input.resourceType}`);
    }

    return this.toDescriptor(definition, input);
  }

  isResourceVisible(input: ResourceRegistryInput & { resourceType: ChatResourceType }): boolean {
    const definition = this.resourceDefinitions[input.resourceType];
    if (!definition) {
      return false;
    }

    return this.isVisible(definition, input);
  }

  private isVisible(definition: ResourceDefinition, input: ResourceRegistryInput): boolean {
    if (definition.visibility.mode === 'global') {
      return definition.visibility.allowedStages?.includes(input.journeySnapshot.currentStage) ?? true;
    }

    if (!definition.stageBinding) {
      return true;
    }

    return definition.stageBinding.stage === input.journeySnapshot.currentStage
      && (definition.stageBinding.phase == null || definition.stageBinding.phase === input.journeySnapshot.currentPhase);
  }

  private toDescriptor(definition: ResourceDefinition, input: ResourceRegistryInput): ChatbotV2ResourceDescriptor {
    return {
      resourceType: definition.resourceType,
      resourceId: definition.resourceId(input),
      status: definition.status(input),
      stageBinding: definition.stageBinding,
      visibility: definition.visibility,
      payload: definition.payload(input),
      actions: definition.actions,
    };
  }

  private buildScopedResourceId(slug: string, input: ResourceRegistryInput): string {
    return `${slug}:${input.scopeId}`;
  }
}
