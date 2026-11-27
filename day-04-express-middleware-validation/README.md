# Day 4 – Express Middleware & Validation (IoT Energy Dashboard)

Prototype Express API for an **IoT energy dashboard** that ingests smart-meter telemetry, detects power/voltage/thermal anomalies, correlates every request with a Request ID, validates payloads and queries with Zod, and normalizes all failures through centralized error middleware.

## Architecture & Middleware Pipeline

1. **`requestContext` (`src/middleware/requestContext.js`)**: Mounted **before** `express.json()`. Assigns or validates an incoming `X-Request-Id`, sets the `X-Request-Id` response header immediately, and logs a structured JSON line on response `finish` with `durationMs`, `statusCode`, and `sensorId`.
2. **`express.json({ limit: '16kb' })`**: Bounds single-reading telemetry frames to 16 KB.
3. **`validate({ body, query, params })` (`src/middleware/validate.js`)**: Reusable Zod validation middleware that stores sanitized values on `req.validated` and forwards `ZodError` instances as `400 VALIDATION_ERROR` with field-level details.
4. **Domain Service (`src/services/energyMonitor.js`)**: Enforces `(sensorId, timestamp)` idempotency (`409 DUPLICATE_READING`) and evaluates anomaly rules (`HIGH_POWER_SPIKE`, `VOLTAGE_OUT_OF_RANGE`, `LOW_POWER_FACTOR`, `THERMAL_OVERLOAD`).
5. **`notFoundHandler` & `errorHandler` (`src/middleware/errorHandler.js`)**: Converts unmatched routes (`404`), malformed JSON (`400 INVALID_JSON`), oversized bodies (`413 PAYLOAD_TOO_LARGE`), operational `AppError`s, and unexpected faults (`500`) into a single JSON error envelope containing `requestId`.

## Compact Implementation Note

In an IoT telemetry pipeline, **middleware ordering determines observability**. Because `express.json()` parses the body before any route-level validation runs, a flaky edge gateway sending truncated JSON or unquoted `NaN` throws a `SyntaxError` (`err.type === 'entity.parse.failed'`) before reaching `validate()`. If `express.json()` were mounted before `requestContext`, or if the centralized error handler did not intercept `entity.parse.failed`, Express would emit a default HTML 400 page without an `X-Request-Id` or structured log. Mounting `requestContext` first and handling `entity.parse.failed` in `errorHandler` guarantees every gateway failure is machine-readable and traceable.

## Edge Case Demonstrated

- **Truncated / malformed gateway JSON (`POST /api/v1/readings` with `{"sensorId": "meter-hvac-01", "powerWatts": NaN`)**: Intercepted before route validation and returned as `400 INVALID_JSON` JSON (never HTML) while preserving the gateway's `X-Request-Id` header and access log entry.
- Additional guards covered in tests: **RTC clock skew** (`timestamp` > 5 minutes in the future rejected with `400`), **apparent power physics check** (`powerWatts > voltageVolts * currentAmps * 1.2 + 50`), and **duplicate gateway retries** (`409 DUPLICATE_READING`).

## Endpoints

- `GET /api/v1/health` — Service health check
- `POST /api/v1/readings` — Ingest sensor reading & return triggered anomaly alerts
- `GET /api/v1/readings` — List readings (`?sensorId=&facilityZone=&limit=`)
- `GET /api/v1/alerts` — List anomaly alerts (`?sensorId=&severity=&acknowledged=`)
- `PATCH /api/v1/alerts/:alertId/acknowledge` — Acknowledge an active anomaly alert

## Run Locally

```bash
npm install
npm test
npm run demo
```
