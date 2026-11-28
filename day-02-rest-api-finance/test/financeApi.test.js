import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('Personal Finance Tracker REST API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const { app } = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('configures monthly budget, logs categorized expenses, triggers warning/exceeded alerts, and filters queries', async () => {
    // 1. PUT /api/v1/budgets/:month/:category
    const budgetRes = await fetch(`${baseUrl}/api/v1/budgets/2026-11/groceries`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limitCents: 20000, alertThresholdPct: 80 }),
    });
    assert.equal(budgetRes.status, 201);
    const budgetBody = await budgetRes.json();
    assert.equal(budgetBody.budget.limitCents, 20000);

    // 2. POST /api/v1/expenses -> crosses 80% warning threshold (17000 / 20000 = 85%)
    const exp1Res = await fetch(`${baseUrl}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCents: 17000,
        category: 'groceries',
        merchant: 'FreshMart',
        occurredAt: '2026-11-28T10:15:00Z',
        note: 'Weekly groceries',
      }),
    });
    assert.equal(exp1Res.status, 201);
    const exp1Body = await exp1Res.json();
    assert.equal(exp1Body.budgetStatus.utilizationPct, 85);
    assert.equal(exp1Body.alertTriggered.severity, 'warning');

    // 3. GET /api/v1/expenses?month=2026-11&category=groceries
    const listRes = await fetch(`${baseUrl}/api/v1/expenses?month=2026-11&category=groceries`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.count, 1);
    assert.equal(listBody.totalCents, 17000);

    // 4. GET /api/v1/alerts?month=2026-11
    const alertsRes = await fetch(`${baseUrl}/api/v1/alerts?month=2026-11`);
    assert.equal(alertsRes.status, 200);
    const alertsBody = await alertsRes.json();
    assert.equal(alertsBody.count, 1);
    assert.equal(alertsBody.alerts[0].severity, 'warning');
  });

  it('returns 400 VALIDATION_ERROR for negative amount and unknown category', async () => {
    const res = await fetch(`${baseUrl}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amountCents: -500,
        category: 'crypto_gambling',
        merchant: 'X',
        occurredAt: 'invalid-date',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length >= 3);
  });
});
