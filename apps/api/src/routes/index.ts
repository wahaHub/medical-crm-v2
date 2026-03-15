import { OpenAPIHono } from '@hono/zod-openapi';
import caseRoutes from './cases.routes.js';
import documentRoutes from './documents.routes.js';
import progressRoutes from './progress.routes.js';

const router = new OpenAPIHono();
router.route('/', caseRoutes);
router.route('/', documentRoutes);
router.route('/', progressRoutes);

export default router;
