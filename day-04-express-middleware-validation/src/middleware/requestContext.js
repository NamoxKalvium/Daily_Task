import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{8,64}$/;

/**
 * Custom middleware that assigns a correlation Request ID and logs
 * structured request completion metrics (including duration and sensor context).
 */
export function requestContext({ logger = console.log } = {}) {
  return (req, res, next) => {
    const incomingId = req.header('x-request-id');
    const requestId = incomingId && SAFE_REQUEST_ID.test(incomingId)
      ? incomingId
      : randomUUID();

    const startNs = process.hrtime.bigint();
    req.requestId = requestId;

    // Set header immediately so aborted or body-parser error responses keep correlation ID.
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const entry = {
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        sensorId: req.validated?.body?.sensorId ?? req.validated?.query?.sensorId ?? null,
      };
      logger(JSON.stringify(entry));
    });

    next();
  };
}
