import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

/**
 * Validates request body, query, and params against Zod schemas.
 * Parsed/coerced values are stored on `req.validated` to keep raw Express inputs untouched.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      const validated = {};
      if (schemas.params) {
        validated.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        validated.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        validated.body = schemas.body.parse(req.body);
      }
      req.validated = validated;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.length > 0 ? issue.path.join('.') : 'root',
          code: issue.code,
          message: issue.message,
        }));
        return next(
          new AppError({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Telemetry payload or query failed validation.',
            details,
          })
        );
      }
      next(err);
    }
  };
}
