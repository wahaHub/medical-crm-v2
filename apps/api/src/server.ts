import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import app from './index.js';
import { registerPatientWs } from './ws/patient-ws.js';
import { getServices } from './composition-root.js';

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Register WebSocket routes
const { patientAuthService } = getServices();
registerPatientWs(app, upgradeWebSocket, patientAuthService);

const port = Number(process.env.PORT ?? 3001);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});

injectWebSocket(server);
