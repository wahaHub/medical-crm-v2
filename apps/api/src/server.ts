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
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const configuredBindHost = process.env.API_BIND_HOST;
const bindHost = configuredBindHost?.trim();
if (configuredBindHost !== undefined && !bindHost) {
  throw new Error('API_BIND_HOST must not be empty when configured');
}

const server = serve({ fetch: app.fetch, port, hostname: bindHost }, (info) => {
  console.log(
    `API server listening on http://${bindHost ?? 'all-interfaces'}:${info.port}`,
  );
});

injectWebSocket(server);
