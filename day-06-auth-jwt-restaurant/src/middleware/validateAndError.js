import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export function validate(schemas) {
  return (req, _res, next) => {
    try {
      const validated = {};
      if (schemas.params) validated.params = schemas.params.parse(req.params);
      if (schemas.query) validated.query = schemas.query.parse(req.query);
      if (schemas.body) validated.body = schemas.body.parse(req.body);
      req.validated = validated;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new AppError({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            details: err.issues.map((issue) => ({
              field: issue.path.join('.') || 'root',
              message: issue.message,
            })),
          })
        );
      }
      next(err);
    }
  };
}

export function notFoundHandler(req, _res, next) {
  next(
    new AppError({
      statusCode: 404,
      code: 'ROUTE_NOT_FOUND',
      message: `No endpoint matches ${req.method} ${req.originalUrl}`,
    })
  );
}

export function errorHandler(err, _req, res, _next) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request body.',
        details: null,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error.',
      details: null,
    },
  });
}
