import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  acknowledgeAlertBodySchema,
  alertParamsSchema,
  createReadingBodySchema,
  listAlertsQuerySchema,
  listReadingsQuerySchema,
} from '../schemas/telemetrySchemas.js';

export function createTelemetryRouter(energyMonitor) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({
      requestId: req.requestId,
      status: 'ok',
      service: 'iot-energy-dashboard-api',
    });
  });

  router.post(
    '/readings',
    validate({ body: createReadingBodySchema }),
    (req, res) => {
      const result = energyMonitor.ingestReading(req.validated.body);
      res.status(201).json({
        requestId: req.requestId,
        data: result,
      });
    }
  );

  router.get(
    '/readings',
    validate({ query: listReadingsQuerySchema }),
    (req, res) => {
      const readings = energyMonitor.listReadings(req.validated.query);
      res.json({
        requestId: req.requestId,
        count: readings.length,
        data: readings,
      });
    }
  );

  router.get(
    '/alerts',
    validate({ query: listAlertsQuerySchema }),
    (req, res) => {
      const alerts = energyMonitor.listAlerts(req.validated.query);
      res.json({
        requestId: req.requestId,
        count: alerts.length,
        data: alerts,
      });
    }
  );

  router.patch(
    '/alerts/:alertId/acknowledge',
    validate({ params: alertParamsSchema, body: acknowledgeAlertBodySchema }),
    (req, res) => {
      const alert = energyMonitor.acknowledgeAlert(
        req.validated.params.alertId,
        req.validated.body
      );
      res.json({
        requestId: req.requestId,
        data: alert,
      });
    }
  );

  return router;
}
