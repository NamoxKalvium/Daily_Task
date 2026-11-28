#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
PORT=3092 node src/server.js >/tmp/day2-finance.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

sleep 0.4

echo "=== 1. PUT /api/v1/budgets/2026-11/groceries ==="
curl -s -i -X PUT http://127.0.0.1:3092/api/v1/budgets/2026-11/groceries \
  -H "Content-Type: application/json" \
  -d '{"limitCents": 20000, "alertThresholdPct": 80}'
echo ""

echo "=== 2. POST /api/v1/expenses (triggers warning at 85%) ==="
curl -s -i -X POST http://127.0.0.1:3092/api/v1/expenses \
  -H "Content-Type: application/json" \
  -d '{"amountCents": 17000, "category": "groceries", "merchant": "FreshMart", "occurredAt": "2026-11-28T10:15:00Z", "note": "Weekly groceries"}'
echo ""

echo "=== 3. GET /api/v1/expenses?month=2026-11&category=groceries ==="
curl -s -i "http://127.0.0.1:3092/api/v1/expenses?month=2026-11&category=groceries"
echo ""

echo "=== 4. GET /api/v1/alerts?month=2026-11 ==="
curl -s -i "http://127.0.0.1:3092/api/v1/alerts?month=2026-11"
echo ""

echo "=== 5. ERROR CASE: POST /api/v1/expenses (invalid negative amount & category) ==="
curl -s -i -X POST http://127.0.0.1:3092/api/v1/expenses \
  -H "Content-Type: application/json" \
  -d '{"amountCents": -500, "category": "crypto_gambling", "merchant": "X", "occurredAt": "bad-date"}'
echo ""
