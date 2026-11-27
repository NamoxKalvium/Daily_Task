import { AppError } from '../errors/AppError.js';

/**
 * Fallback 404 middleware for unmatched routes.
 */
export function notFoundHandler(req, _res, next) {
  next(
    new AppError({
      statusCode: 404,
      code: 'ROUTE_NOT_FOUND',
      message: `No endpoint matches ${req.method} ${req.originalUrl}`,
    })
  );
}

/**
 * Centralized Express error-handling middleware.
 * Normalizes body-parser syntax/size errors, operational AppErrors, and unexpected faults
 * into one JSON envelope stamped with `requestId`.
 */
export function errorHandler({ errorLogger = console.error } = {}) {
  return (err, req, res, _next) => {
    const requestId = req.requestId ?? null;

    // Edge case: express.json() throws SyntaxError before route validation runs.
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        requestId,
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON payload from sensor gateway.',
          details: [{ field: 'body', code: 'syntax_error', message: err.message }],
        },
      });
    }

    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        requestId,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Telemetry payload exceeds the 16kb single-reading limit.',
          details: null,
        },
      });
    }

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        requestId,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }

    errorLogger(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        level: 'error',
        message: err?.message ?? 'Unexpected error',
        stack: err?.stack,
      })
    );

    return res.status(500).json({
      requestId,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error while processing telemetry.',
        details: null,
      },
    });
  };
}
