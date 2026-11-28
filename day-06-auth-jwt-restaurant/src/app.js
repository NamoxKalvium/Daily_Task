import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/validateAndError.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createReservationRouter } from './routes/reservationRoutes.js';
import { ReservationService } from './services/reservationService.js';

/**
 * Creates the Restaurant Reservation API.
 * Fails closed if `jwtSecret` is missing or shorter than 32 characters.
 */
export function createApp({
  jwtSecret,
  jwtExpiresIn = '15m',
  now = () => Date.now(),
} = {}) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be provided and at least 32 characters long.');
  }

  const app = express();
  const reservationService = new ReservationService({ now });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'restaurant-reservation-auth-api' });
  });

  app.use('/api/v1/auth', createAuthRouter({ reservationService, jwtSecret, jwtExpiresIn }));
  app.use('/api/v1', createReservationRouter({ reservationService, jwtSecret }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, reservationService };
}
