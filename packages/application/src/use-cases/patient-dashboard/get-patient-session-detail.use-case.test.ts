import { describe, expect, it, vi } from 'vitest';
import { GetPatientSessionDetailUseCase } from './get-patient-session-detail.use-case.js';

describe('GetPatientSessionDetailUseCase system message localization', () => {
  it('localizes an existing starter message using the requested locale', async () => {
    const useCase = new GetPatientSessionDetailUseCase(
      { findByPatientId: vi.fn().mockResolvedValue([]) } as any,
      {} as any,
      {
        findBySessionId: vi.fn().mockResolvedValue({
          id: 'ai-session-1',
          sessionId: 'widget-chat:patient-1:case-1',
          patientId: 'patient-1',
          site: 'beauty',
          automationMode: 'mechanical',
          statusSnapshot: {
            processExplained: false,
            supportingDocuments: [],
          },
        }),
      } as any,
      {
        listBySession: vi.fn().mockResolvedValue([{
          id: 'starter-1',
          sessionId: 'ai-session-1',
          role: 'ASSISTANT',
          content: 'Legacy English starter copy',
          citations: [],
          metadata: { widgetStarterSeed: true },
          createdAt: new Date('2026-08-07T00:00:00.000Z'),
        }]),
      } as any,
      { getSignedUrls: vi.fn() } as any,
    );

    const result = await useCase.execute({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      locale: 'es',
    });

    expect(result.data[0]?.content).toContain('Hola');
    expect(result.chatState?.availableActions[0]?.label).toBe('Cargar informes médicos');
  });
});
