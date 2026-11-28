import { Router } from 'express';
import { z } from 'zod';
import { signAccessToken } from '../auth/jwt.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateAndError.js';

const registerBodySchema = z
  .object({
    email: z.string().email(),
    name: z.string().trim().min(2).max(60),
    password: z.string().min(8).max(128),
  })
  .strict();

const loginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export function createAuthRouter({ reservationService, jwtSecret, jwtExpiresIn }) {
  const router = Router();

  router.post('/register', validate({ body: registerBodySchema }), async (req, res, next) => {
    try {
      const user = await reservationService.registerDiner(req.validated.body);
      const accessToken = signAccessToken({
        user,
        jwtSecret,
        expiresIn: jwtExpiresIn,
      });
      res.status(201).json({
        user,
        tokenType: 'Bearer',
        expiresIn: jwtExpiresIn,
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', validate({ body: loginBodySchema }), async (req, res, next) => {
    try {
      const user = await reservationService.authenticateUser(req.validated.body);
      const accessToken = signAccessToken({
        user,
        jwtSecret,
        expiresIn: jwtExpiresIn,
      });
      res.json({
        user,
        tokenType: 'Bearer',
        expiresIn: jwtExpiresIn,
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', authenticate({ jwtSecret }), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
