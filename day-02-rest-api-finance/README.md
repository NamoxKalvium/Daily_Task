# Day 2 – REST API Design (Personal Finance Tracker)

RESTful API for a **personal finance tracker** focused on **expense categorization** and **monthly budget alerts**.

## Setup & Run

```bash
npm install
npm test
npm start
```

## Design Decisions

1. **Integer cents (`amountCents`, `limitCents`)**: Avoids floating-point rounding drift (`0.1 + 0.2 !== 0.3`) in budget utilization math.
2. **Idempotent budget upsert (`PUT /api/v1/budgets/:month/:category`)**: Uses natural composite keys `(YYYY-MM, category)` so setting a category cap twice updates cleanly (`201` on create, `200` on update).
3. **Inline budget evaluation on `POST /api/v1/expenses`**: Evaluating monthly spend immediately on expense creation returns `budgetStatus` and `alertTriggered` (`warning` at `>= alertThresholdPct`, `exceeded` when `spentCents > limitCents`) in a single round-trip.
4. **Strict Zod validation**: Rejects unknown fields (`.strict()`), negative/zero amounts, non-ISO timestamps, and unknown categories with `400 VALIDATION_ERROR`.

## Endpoints

### 1. Set / Update Category Monthly Budget
- **Method & Path:** `PUT /api/v1/budgets/:month/:category`
- **Validation:** `month` (`YYYY-MM`), `category` enum (`groceries | dining | transport | utilities | housing | entertainment | health | other`), `limitCents` (positive int), `alertThresholdPct` (int `50..100`, default `80`).
- **Request:**
  ```json
  { "limitCents": 20000, "alertThresholdPct": 80 }
  ```
- **Response (`201 Created` / `200 OK`):**
  ```json
  {
    "budget": {
      "month": "2026-11",
      "category": "groceries",
      "limitCents": 20000,
      "alertThresholdPct": 80,
      "updatedAt": "2026-11-28T08:50:00.000Z"
    }
  }
  ```

### 2. Log Categorized Expense
- **Method & Path:** `POST /api/v1/expenses`
- **Validation:** `amountCents` (positive int), `category` enum, `merchant` (2–80 chars), `occurredAt` (ISO-8601 with timezone), optional `note` (`<= 160` chars).
- **Request:**
  ```json
  {
    "amountCents": 17000,
    "category": "groceries",
    "merchant": "FreshMart",
    "occurredAt": "2026-11-28T10:15:00Z",
    "note": "Weekly groceries"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "expense": {
      "id": "exp_a1b2c3d4",
      "amountCents": 17000,
      "category": "groceries",
      "merchant": "FreshMart",
      "month": "2026-11",
      "occurredAt": "2026-11-28T10:15:00Z",
      "note": "Weekly groceries"
    },
    "budgetStatus": {
      "month": "2026-11",
      "category": "groceries",
      "limitCents": 20000,
      "spentCents": 17000,
      "remainingCents": 3000,
      "utilizationPct": 85
    },
    "alertTriggered": {
      "id": "alrt_e5f60718",
      "severity": "warning",
      "utilizationPct": 85,
      "message": "groceries spending reached 85% of 2026-11 budget cap."
    }
  }
  ```

### 3. Query Categorized Expenses
- **Method & Path:** `GET /api/v1/expenses?month=2026-11&category=groceries`
- **Response (`200 OK`):** Returns `{ count, totalCents, expenses }`.

### 4. List Monthly Budget Alerts
- **Method & Path:** `GET /api/v1/alerts?month=2026-11&severity=warning`
- **Response (`200 OK`):** Returns `{ count, alerts }`.

### Error Response (`400 Bad Request`)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request payload or query parameters failed validation.",
    "details": [
      { "field": "amountCents", "message": "Number must be greater than 0" },
      { "field": "category", "message": "Invalid enum value..." }
    ]
  }
}
```

## Verification Evidence (`curl` + `node --test`)

- `npm test` (`test/financeApi.test.js`): **2/2 tests passed** (`110ms`).
- `bash scripts/curl-test.sh` against live Express server on `127.0.0.1:3092`:

```text
=== 1. PUT /api/v1/budgets/2026-11/groceries ===
HTTP/1.1 201 Created
{"budget":{"month":"2026-11","category":"groceries","limitCents":20000,"alertThresholdPct":80,"updatedAt":"2026-11-28T08:51:05.051Z"}}

=== 2. POST /api/v1/expenses (triggers warning at 85%) ===
HTTP/1.1 201 Created
{"expense":{"id":"exp_875d2738","amountCents":17000,"category":"groceries","merchant":"FreshMart","month":"2026-11","occurredAt":"2026-11-28T10:15:00Z","note":"Weekly groceries","createdAt":"2026-11-28T08:51:05.068Z"},"budgetStatus":{"month":"2026-11","category":"groceries","limitCents":20000,"spentCents":17000,"remainingCents":3000,"utilizationPct":85},"alertTriggered":{"id":"alrt_3ef93edc","month":"2026-11","category":"groceries","severity":"warning","utilizationPct":85,"spentCents":17000,"limitCents":20000,"message":"groceries spending reached 85% of 2026-11 budget cap.","triggeredByExpenseId":"exp_875d2738","createdAt":"2026-11-28T08:51:05.068Z"}}

=== 3. GET /api/v1/expenses?month=2026-11&category=groceries ===
HTTP/1.1 200 OK
{"count":1,"totalCents":17000,"expenses":[{"id":"exp_875d2738","amountCents":17000,"category":"groceries","merchant":"FreshMart","month":"2026-11","occurredAt":"2026-11-28T10:15:00Z","note":"Weekly groceries","createdAt":"2026-11-28T08:51:05.068Z"}]}

=== 4. GET /api/v1/alerts?month=2026-11 ===
HTTP/1.1 200 OK
{"count":1,"alerts":[{"id":"alrt_3ef93edc","month":"2026-11","category":"groceries","severity":"warning","utilizationPct":85,"spentCents":17000,"limitCents":20000,"message":"groceries spending reached 85% of 2026-11 budget cap.","triggeredByExpenseId":"exp_875d2738","createdAt":"2026-11-28T08:51:05.068Z"}]}

=== 5. ERROR CASE: POST /api/v1/expenses (invalid negative amount & category) ===
HTTP/1.1 400 Bad Request
{"error":{"code":"VALIDATION_ERROR","message":"Request payload or query parameters failed validation.","details":[{"field":"amountCents","message":"Number must be greater than 0"},{"field":"category","message":"Invalid enum value. Expected 'groceries' | 'dining' | 'transport' | 'utilities' | 'housing' | 'entertainment' | 'health' | 'other', received 'crypto_gambling'"},{"field":"merchant","message":"String must contain at least 2 character(s)"},{"field":"occurredAt","message":"occurredAt must be ISO-8601 with timezone"}]}}
```
