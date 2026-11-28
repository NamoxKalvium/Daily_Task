import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError.js';

const ISSUER = 'restaurant-reservation-api';

/**
 * Issues a signed HS256 JWT containing user subject and role claims.
 */
export function signAccessToken({ user, jwtSecret, expiresIn = '15m' }) {
  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      name: user.name,
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      subject: user.id,
      issuer: ISSUER,
      expiresIn,
    }
  );
}

/**
 * Verifies an HS256 JWT and maps expiry/tampering failures to 401 AppErrors.
 */
export function verifyAccessToken({ token, jwtSecret }) {
  try {
    return jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      throw new AppError({
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please log in again.',
      });
    }
    throw new AppError({
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Invalid or tampered bearer token.',
    });
  }
}
