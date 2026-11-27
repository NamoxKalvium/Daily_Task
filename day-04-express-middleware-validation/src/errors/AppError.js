/**
 * Operational application error carrying HTTP status, machine-readable code,
 * and optional structured field details for centralized error handling.
 */
export class AppError extends Error {
  constructor({ statusCode = 500, code = 'INTERNAL_ERROR', message, details = null, isOperational = true }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}
