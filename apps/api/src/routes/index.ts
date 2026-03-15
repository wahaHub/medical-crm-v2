import { OpenAPIHono } from '@hono/zod-openapi';
import caseRoutes from './cases.routes.js';
import documentRoutes from './documents.routes.js';
import progressRoutes from './progress.routes.js';
import hospitalRoutes from './hospitals.routes.js';
import conversationRoutes from './conversations.routes.js';
import messageRoutes from './messages.routes.js';
import consultationRoutes from './consultations.routes.js';

const router = new OpenAPIHono();
router.route('/', caseRoutes);
router.route('/', documentRoutes);
router.route('/', progressRoutes);
router.route('/', hospitalRoutes);
router.route('/', conversationRoutes);
router.route('/', messageRoutes);
router.route('/', consultationRoutes);

export default router;
