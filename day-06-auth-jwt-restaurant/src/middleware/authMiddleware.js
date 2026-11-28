import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '../auth/jwt.js';

/**
 * Authenticates requests carrying an `Authorization: Bearer <token>` header.
 */
export function authenticate({ jwtSecret }) {
  return (req, _res, next) => {
    const authHeader = req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new AppError({
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Missing Authorization: Bearer <token> header.',
        })
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return next(
        new AppError({
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Bearer token must not be empty.',
        })
      );
    }

    try {
      const payload = verifyAccessToken({ token, jwtSecret });
      req.user = {
        id: payload.sub,
        role: payload.role,
        email: payload.email,
        name: payload.name,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Restricts access to specific user roles (e.g., `staff`).
 */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(
        new AppError({
          statusCode: 403,
          code: 'FORBIDDEN_ROLE',
          message: `Requires one of roles: ${allowedRoles.join(', ')}.`,
        })
      );
    }
    next();
  };
}
