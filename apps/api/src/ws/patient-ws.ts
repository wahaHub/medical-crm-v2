import type { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PatientAuthService } from '@medical-crm/domain';
import { wsManager } from './ws-manager.js';
import { getServices } from '../composition-root.js';

export function registerPatientWs(
  app: Hono,
  upgradeWebSocket: any,
  authService: PatientAuthService,
) {
  // Per-conversation channel
  app.get('/ws/conversations/:id', upgradeWebSocket((c: any) => {
    const token = getCookie(c, 'patient_session');
    const conversationId = c.req.param('id');

    return {
      async onOpen(_event: any, ws: any) {
        if (!token) { ws.close(4001, 'Unauthorized'); return; }
        try {
          const payload = await authService.verifySessionToken(token);
          const { getPatientConversations } = getServices();
          const conversations = await getPatientConversations.execute({ patientId: payload.userId });
          const hasConversationAccess = conversations.some((item) => item.id === conversationId);
          if (!hasConversationAccess) {
            ws.close(4003, 'Forbidden');
            return;
          }
          wsManager.join(`conv:${conversationId}`, ws);
        } catch {
          ws.close(4001, 'Invalid token');
        }
      },
      onClose(_event: any, ws: any) {
        wsManager.leave(`conv:${conversationId}`, ws);
      },
    };
  }));

  // Per-patient notification channel
  app.get('/ws/patient/notifications', upgradeWebSocket((c: any) => {
    const token = getCookie(c, 'patient_session');

    return {
      async onOpen(_event: any, ws: any) {
        if (!token) { ws.close(4001, 'Unauthorized'); return; }
        try {
          const payload = await authService.verifySessionToken(token);
          wsManager.join(`patient:${payload.userId}`, ws);
        } catch {
          ws.close(4001, 'Invalid token');
        }
      },
      onClose(_event: any, ws: any) {
        wsManager.removeFromAll(ws);
      },
    };
  }));
}
