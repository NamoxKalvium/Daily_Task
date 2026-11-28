import { randomUUID } from 'node:crypto';

/**
 * In-memory personal finance tracker managing category budgets,
 * categorized expenses, and automatic monthly budget alerts.
 */
export class FinanceService {
  constructor() {
    this.budgets = new Map();
    this.expenses = [];
    this.alerts = [];
  }

  upsertBudget({ month, category, limitCents, alertThresholdPct }) {
    const key = `${month}::${category}`;
    const existed = this.budgets.has(key);
    const budget = {
      month,
      category,
      limitCents,
      alertThresholdPct,
      updatedAt: new Date().toISOString(),
    };
    this.budgets.set(key, budget);
    return { existed, budget };
  }

  createExpense({ amountCents, category, merchant, occurredAt, note }) {
    const month = new Date(occurredAt).toISOString().slice(0, 7);
    const expense = {
      id: `exp_${randomUUID().slice(0, 8)}`,
      amountCents,
      category,
      merchant,
      month,
      occurredAt,
      note: note ?? null,
      createdAt: new Date().toISOString(),
    };
    this.expenses.push(expense);

    const budget = this.budgets.get(`${month}::${category}`) ?? null;
    const spentCents = this.expenses
      .filter((e) => e.month === month && e.category === category)
      .reduce((sum, e) => sum + e.amountCents, 0);

    let budgetStatus = null;
    let alertTriggered = null;

    if (budget) {
      const utilizationPct = Math.round((spentCents / budget.limitCents) * 100);
      budgetStatus = {
        month,
        category,
        limitCents: budget.limitCents,
        spentCents,
        remainingCents: Math.max(0, budget.limitCents - spentCents),
        utilizationPct,
      };

      if (utilizationPct >= budget.alertThresholdPct) {
        const severity = spentCents > budget.limitCents ? 'exceeded' : 'warning';
        alertTriggered = {
          id: `alrt_${randomUUID().slice(0, 8)}`,
          month,
          category,
          severity,
          utilizationPct,
          spentCents,
          limitCents: budget.limitCents,
          message:
            severity === 'exceeded'
              ? `${category} spending (${spentCents}c) exceeded ${month} budget cap (${budget.limitCents}c).`
              : `${category} spending reached ${utilizationPct}% of ${month} budget cap.`,
          triggeredByExpenseId: expense.id,
          createdAt: new Date().toISOString(),
        };
        this.alerts.push(alertTriggered);
      }
    }

    return { expense, budgetStatus, alertTriggered };
  }

  listExpenses({ month, category }) {
    const items = this.expenses
      .filter((e) => (!month || e.month === month) && (!category || e.category === category))
      .slice()
      .reverse();
    const totalCents = items.reduce((sum, e) => sum + e.amountCents, 0);
    return { items, totalCents };
  }

  listAlerts({ month, severity }) {
    return this.alerts
      .filter((a) => (!month || a.month === month) && (!severity || a.severity === severity))
      .slice()
      .reverse();
  }
}
