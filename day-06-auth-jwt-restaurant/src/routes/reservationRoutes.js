import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateAndError.js';
import { MAX_PARTY_SIZE, TIME_SLOTS } from '../services/reservationService.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const availabilityQuerySchema = z.object({
  date: z.string().regex(dateRegex, 'date must be YYYY-MM-DD'),
  partySize: z.coerce.number().int().min(1).max(MAX_PARTY_SIZE).default(2),
});

const createReservationSchema = z
  .object({
    guestName: z.string().trim().min(2).max(80),
    date: z.string().regex(dateRegex, 'date must be YYYY-MM-DD'),
    timeSlot: z.enum(TIME_SLOTS),
    partySize: z.number().int().min(1).max(MAX_PARTY_SIZE),
    notes: z.string().trim().max(200).optional(),
  })
  .strict();

const listReservationsQuerySchema = z.object({
  date: z.string().regex(dateRegex).optional(),
  status: z.enum(['confirmed', 'cancelled', 'seated']).optional(),
});

const reservationParamsSchema = z.object({
  id: z.string().min(4).max(40),
});

export function createReservationRouter({ reservationService, jwtSecret }) {
  const router = Router();
  const requireAuth = authenticate({ jwtSecret });

  // Public availability lookup
  router.get('/availability', validate({ query: availabilityQuerySchema }), (req, res) => {
    const slots = reservationService.getAvailability(req.validated.query);
    res.json({
      date: req.validated.query.date,
      partySize: req.validated.query.partySize,
      slots,
    });
  });

  // Protected reservation routes
  router.post(
    '/reservations',
    requireAuth,
    validate({ body: createReservationSchema }),
    (req, res) => {
      const reservation = reservationService.createReservation({
        ownerUserId: req.user.id,
        ...req.validated.body,
      });
      res.status(201).json({ reservation });
    }
  );

  router.get(
    '/reservations',
    requireAuth,
    validate({ query: listReservationsQuerySchema }),
    (req, res) => {
      const reservations = reservationService.listReservations({
        actor: req.user,
        ...req.validated.query,
      });
      res.json({ count: reservations.length, reservations });
    }
  );

  router.get(
    '/reservations/:id',
    requireAuth,
    validate({ params: reservationParamsSchema }),
    (req, res) => {
      const reservation = reservationService.getReservationById({
        reservationId: req.validated.params.id,
        actor: req.user,
      });
      res.json({ reservation });
    }
  );

  router.post(
    '/reservations/:id/cancel',
    requireAuth,
    validate({ params: reservationParamsSchema }),
    (req, res) => {
      const reservation = reservationService.cancelReservation({
        reservationId: req.validated.params.id,
        actor: req.user,
      });
      res.json({ reservation });
    }
  );

  // Staff-only operational endpoint
  router.patch(
    '/reservations/:id/seat',
    requireAuth,
    requireRole('staff'),
    validate({ params: reservationParamsSchema }),
    (req, res) => {
      const reservation = reservationService.markSeated({
        reservationId: req.validated.params.id,
      });
      res.json({ reservation });
    }
  );

  return router;
}
