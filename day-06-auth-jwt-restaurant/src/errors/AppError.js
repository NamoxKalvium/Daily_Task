export class AppError extends Error {
  constructor({ statusCode = 500, code = 'INTERNAL_ERROR', message, details = null }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
