import express from 'express';
import { ZodError } from 'zod';
import { FinanceService } from './financeService.js';
import {
  budgetParamsSchema,
  createExpenseBodySchema,
  listAlertsQuerySchema,
  listExpensesQuerySchema,
  upsertBudgetBodySchema,
} from './schemas.js';

function validate(schemas) {
  return (req, _res, next) => {
    try {
      const validated = {};
      if (schemas.params) validated.params = schemas.params.parse(req.params);
      if (schemas.query) validated.query = schemas.query.parse(req.query);
      if (schemas.body) validated.body = schemas.body.parse(req.body);
      req.validated = validated;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createApp() {
  const app = express();
  const financeService = new FinanceService();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  // 1. PUT /api/v1/budgets/:month/:category — Configure monthly category budget cap
  app.put(
    '/api/v1/budgets/:month/:category',
    validate({ params: budgetParamsSchema, body: upsertBudgetBodySchema }),
    (req, res) => {
      const { existed, budget } = financeService.upsertBudget({
        ...req.validated.params,
        ...req.validated.body,
      });
      res.status(existed ? 200 : 201).json({ budget });
    }
  );

  // 2. POST /api/v1/expenses — Record categorized expense & evaluate budget alerts
  app.post(
    '/api/v1/expenses',
    validate({ body: createExpenseBodySchema }),
    (req, res) => {
      const result = financeService.createExpense(req.validated.body);
      res.status(201).json(result);
    }
  );

  // 3. GET /api/v1/expenses — Query categorized expenses by month and/or category
  app.get(
    '/api/v1/expenses',
    validate({ query: listExpensesQuerySchema }),
    (req, res) => {
      const { items, totalCents } = financeService.listExpenses(req.validated.query);
      res.json({
        count: items.length,
        totalCents,
        expenses: items,
      });
    }
  );

  // 4. GET /api/v1/alerts — Retrieve triggered monthly budget alerts
  app.get(
    '/api/v1/alerts',
    validate({ query: listAlertsQuerySchema }),
    (req, res) => {
      const alerts = financeService.listAlerts(req.validated.query);
      res.json({
        count: alerts.length,
        alerts,
      });
    }
  );

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No endpoint matches ${req.method} ${req.originalUrl}`,
      },
    });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload or query parameters failed validation.',
          details: err.issues.map((i) => ({
            field: i.path.join('.') || 'root',
            message: i.message,
          })),
        },
      });
    }

    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON body.',
        },
      });
    }

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error.',
      },
    });
  });

  return { app, financeService };
}
