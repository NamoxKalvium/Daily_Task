import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { createTelemetryRouter } from './routes/telemetryRoutes.js';
import { EnergyMonitorService } from './services/energyMonitor.js';

/**
 * Builds the Express application with deterministic middleware order:
 * 1. requestContext (runs first so even body-parser failures carry X-Request-Id & logs)
 * 2. express.json (bounded to 16kb for single-reading IoT payloads)
 * 3. versioned API routes with per-route Zod validation
 * 4. 404 fallback + centralized errorHandler
 */
export function createApp({ logger = console.log, errorLogger = console.error } = {}) {
  const app = express();
  const energyMonitor = new EnergyMonitorService();

  app.disable('x-powered-by');
  app.use(requestContext({ logger }));
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/v1', createTelemetryRouter(energyMonitor));

  app.use(notFoundHandler);
  app.use(errorHandler({ errorLogger }));

  return { app, energyMonitor };
}
