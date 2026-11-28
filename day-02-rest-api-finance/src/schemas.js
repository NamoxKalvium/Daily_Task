import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'groceries',
  'dining',
  'transport',
  'utilities',
  'housing',
  'entertainment',
  'health',
  'other',
];

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const budgetParamsSchema = z.object({
  month: z.string().regex(MONTH_REGEX, 'month must be YYYY-MM'),
  category: z.enum(EXPENSE_CATEGORIES),
});

export const upsertBudgetBodySchema = z
  .object({
    limitCents: z.number().int().positive().max(100_000_000),
    alertThresholdPct: z.number().int().min(50).max(100).default(80),
  })
  .strict();

export const createExpenseBodySchema = z
  .object({
    amountCents: z.number().int().positive().max(50_000_000),
    category: z.enum(EXPENSE_CATEGORIES),
    merchant: z.string().trim().min(2).max(80),
    occurredAt: z.string().datetime({ offset: true, message: 'occurredAt must be ISO-8601 with timezone' }),
    note: z.string().trim().max(160).optional(),
  })
  .strict();

export const listExpensesQuerySchema = z
  .object({
    month: z.string().regex(MONTH_REGEX, 'month must be YYYY-MM').optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
  })
  .strict();

export const listAlertsQuerySchema = z
  .object({
    month: z.string().regex(MONTH_REGEX, 'month must be YYYY-MM').optional(),
    severity: z.enum(['warning', 'exceeded']).optional(),
  })
  .strict();
