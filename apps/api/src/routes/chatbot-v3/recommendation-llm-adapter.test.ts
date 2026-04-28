import { describe, expect, it, vi } from 'vitest';
import { RecommendationLlmAdapter } from './recommendation-llm-adapter.js';
import { buildRecommendationWorkerPrompt } from './recommendation-prompts.js';
import type { RecommendationWorkerTask } from './worker-task.js';

function createRecommendationTask(
  latestUserMessage: string,
  overrides: Partial<RecommendationWorkerTask> = {},
): RecommendationWorkerTask {
  return {
    agent: 'RecommendationAgent',
    fromStage: 'RECOMMENDATION',
    toStage: 'RECOMMENDATION',
    latestUserMessage,
    recommendationTask: 'generate',
    ...overrides,
  };
}

describe('RecommendationLlmAdapter', () => {
  it('distinguishes summary-backed recommendations from intake-only recommendations after triage skip', () => {
    const summaryBackedPrompt = buildRecommendationWorkerPrompt({
      task: createRecommendationTask('Please recommend hospitals for me.', {
        recommendationBasis: 'INTAKE_AND_FOLLOW_UP_SUMMARY',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
      }),
      recommendations: [],
    });

    expect(summaryBackedPrompt).toContain('Recommendation basis: intake + follow-up summary');
    expect(summaryBackedPrompt).toContain('Follow-up summary: Chest pain for three days; moderate severity; blood test already completed.');

    const intakeOnlyPrompt = buildRecommendationWorkerPrompt({
      task: createRecommendationTask('Please recommend hospitals for me.', {
        recommendationBasis: 'INTAKE_ONLY_AFTER_TRIAGE_SKIP',
        minimalTriageAnswersSummary: null,
      }),
      recommendations: [],
    });

    expect(intakeOnlyPrompt).toContain('Recommendation basis: intake only after follow-up skip');
    expect(intakeOnlyPrompt).not.toContain('Follow-up summary:');
  });

  it('surfaces loaded recommendation skill sections as explicit prompt context', () => {
    const prompt = buildRecommendationWorkerPrompt({
      task: createRecommendationTask('Please recommend hospitals for lung cancer.', {
        currentStage: 'RECOMMENDATION',
        primaryStage: 'RECOMMENDATION',
        loadedSkillSections: [{
          skillId: 'hospital_recommendation_skill',
          role: 'primary',
          reasonCode: 'recommend_hospitals',
          sectionIds: ['recommendation_policy', 'candidate_retrieval', 'safe_handling'],
          readIntentTypes: ['HOSPITAL_RECOMMENDATION'],
          policyText: ['Use only candidate recommendations, retrieved context, and known facts; do not invent hospitals or rankings.'],
          retrievalGuidance: ['Rank and explain only the supplied candidate recommendations.'],
          handlingGuidance: ['When evidence is missing, say the recommendation can be refined instead of creating new options.'],
        }],
      }),
      recommendations: [],
    });

    expect(prompt).toContain('loaded_skill_sections=');
    expect(prompt).toContain('hospital_recommendation_skill');
    expect(prompt).toContain('"sectionIds":["recommendation_policy","candidate_retrieval","safe_handling"]');
    expect(prompt).toContain('Use only candidate recommendations, retrieved context, and known facts; do not invent hospitals or rankings.');
    expect(prompt).toContain('Rank and explain only the supplied candidate recommendations.');
    expect(prompt).toContain('When evidence is missing, say the recommendation can be refined instead of creating new options.');
    expect(prompt).toContain('"readIntentTypes":["HOSPITAL_RECOMMENDATION"]');
    expect(prompt).not.toContain('allowed_skill_packs=');
    expect(prompt).not.toContain('hospitalRecommendationSkill');
    expect(prompt).not.toContain('hospital_recommendation_policy_skill');
    expect(prompt).not.toContain('[object Object]');
  });

  it('renders stage labels from current fields with legacy fallback and no undefined values', () => {
    const currentPrompt = buildRecommendationWorkerPrompt({
      task: createRecommendationTask('Compare these hospitals.', {
        currentStage: 'RECOMMENDATION',
        primaryStage: 'SELECT_HOSPITAL',
      }),
      recommendations: [],
    });

    expect(currentPrompt).toContain('current_stage=RECOMMENDATION');
    expect(currentPrompt).toContain('primary_stage=SELECT_HOSPITAL');
    expect(currentPrompt).not.toContain('current_stage=undefined');
    expect(currentPrompt).not.toContain('primary_stage=undefined');

    const legacyPrompt = buildRecommendationWorkerPrompt({
      task: createRecommendationTask('Compare these hospitals.', {
        currentStage: undefined,
        primaryStage: undefined,
        fromStage: 'RECOMMENDATION',
        toStage: 'SELECT_HOSPITAL',
      } as Partial<RecommendationWorkerTask>),
      recommendations: [],
    });

    expect(legacyPrompt).toContain('current_stage=RECOMMENDATION');
    expect(legacyPrompt).toContain('primary_stage=SELECT_HOSPITAL');
    expect(legacyPrompt).not.toContain('current_stage=undefined');
    expect(legacyPrompt).not.toContain('primary_stage=undefined');
  });

  it('uses structured recommendation task metadata instead of parsing taskPrompt lines', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
              reason: 'Thoracic oncology focus',
            },
          ],
        })),
      },
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Compare the hospitals for me.', {
        recommendationTask: 'compare',
      }),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });
  });

  it('fails closed to a compact grounded fallback when structured output is invalid', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: 'hospital-1',
          explanation: 42,
        })),
      },
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Compare the best options for me.', {
        recommendationTask: 'compare',
      }),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      nodePromptVersion: 'recommendation-worker-test',
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when the model invents hospitals outside the supplied candidate list', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hallucinated-1',
              name: 'Imaginary Cancer Center',
              reason: 'Invented by the model',
            },
          ],
          explanation: 'This compares the top options.',
        })),
      },
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Compare the best options for me.', {
        recommendationTask: 'compare',
      }),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when compare/explain turns omit the required explanation', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
              reason: 'Thoracic oncology focus',
            },
          ],
        })),
      },
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Compare the hospitals for me.', {
        recommendationTask: 'compare',
      }),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These options can be compared by cancer focus, team breadth, and whether you prefer a more specialized or broader hospital.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });

  it('fails closed when explanation mentions cross-domain workflow state', async () => {
    const adapter = new RecommendationLlmAdapter({
      worker: {
        promptVersion: 'recommendation-worker-test',
        run: vi.fn(async () => ({
          recommendations: [
            {
              hospitalId: 'hospital-1',
              name: 'Shanghai Chest Hospital',
              reason: 'Thoracic oncology focus',
            },
          ],
          explanation: 'Your records are complete and online consultation can be booked with this hospital now.',
        })),
      },
    });

    await expect(adapter.runGenerate({
      task: createRecommendationTask('Why this one?', {
        recommendationTask: 'explain',
      }),
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
          score: 0.94,
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
          score: 0.91,
        },
      ],
    })).resolves.toEqual({
      recommendations: [
        {
          hospitalId: 'hospital-1',
          name: 'Shanghai Chest Hospital',
          reason: 'Thoracic oncology focus',
        },
        {
          hospitalId: 'hospital-2',
          name: 'Fudan Cancer Center',
          reason: 'Strong multidisciplinary lung cancer team',
        },
      ],
      explanation: 'These recommendations are grounded in the current hospital list and can be refreshed if you want different options later.',
    });

    expect(adapter.getLastRunMetadata()).toMatchObject({
      fallbackUsed: true,
      schemaValidationFailed: true,
    });
  });
});
