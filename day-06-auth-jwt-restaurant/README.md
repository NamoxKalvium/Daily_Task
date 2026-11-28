# Day 6 – Authentication & Authorization (Restaurant Reservation System)

Express API implementing **JWT authentication**, **scrypt password hashing**, **token expiry enforcement**, and **role + ownership authorization** for a restaurant reservation system with party-size limits, slot availability tracking, and a 2-hour cancellation cutoff.

## Auth & Authorization Design

- **Password Hashing (`src/auth/password.js`)**: Passwords are hashed with Node's `crypto.scrypt` and a unique 16-byte random salt per user (`<saltHex>:<derivedKeyHex>`), verified with `crypto.timingSafeEqual` to eliminate timing side channels.
- **JWT Login & Expiry (`src/auth/jwt.js`, `src/routes/authRoutes.js`)**:
  - `POST /api/v1/auth/register` always assigns `role: 'diner'` (preventing privilege escalation via request body).
  - `POST /api/v1/auth/login` issues an `HS256` JWT (`expiresIn: '15m'`, `issuer: 'restaurant-reservation-api'`, `subject: user.id`, `role`).
  - `verifyAccessToken` pins `algorithms: ['HS256']` and maps expired tokens explicitly to `401 TOKEN_EXPIRED`.
- **Protected Routes & Ownership / Role Matrix (`src/routes/reservationRoutes.js`)**:

| Endpoint | Auth | Role / Ownership Rule | Domain Rule |
| --- | --- | --- | --- |
| `GET /api/v1/availability` | Public | None | Shows remaining seats per slot (`20` capacity) |
| `POST /api/v1/reservations` | JWT | `diner` or `staff` (sets `ownerUserId = req.user.id`) | `1..8` party size; `409` if slot full |
| `GET /api/v1/reservations` | JWT | `diner`: own only; `staff`: all reservations | Optional `date` / `status` filters |
| `GET /api/v1/reservations/:id` | JWT | `ownerUserId === req.user.id` OR `staff` | `403 FORBIDDEN_OWNERSHIP` otherwise |
| `POST /api/v1/reservations/:id/cancel` | JWT | `ownerUserId === req.user.id` OR `staff` | `diner` blocked `< 2h` before seating (`422`); `staff` can override |
| `PATCH /api/v1/reservations/:id/seat` | JWT | `staff` only (`requireRole('staff')`) | `403 FORBIDDEN_ROLE` for diners |

## Assumptions

1. Single-restaurant capacity is fixed at **20 seats** across three UTC seating slots (`18:00`, `19:30`, `21:00`) with a max online party size of **8 guests**.
2. Staff accounts are provisioned internally (`seedUser`) rather than self-registered.
3. Access tokens use short-lived stateless HS256 JWTs (`15m`); immediate revocation before expiry (e.g., compromised session) would require a token denylist or refresh-token rotation in production.

## Threat Note

- **No committed secrets**: `.gitignore` excludes `.env`, `.env.example` holds placeholders only, and `createApp()` fails closed at startup if `JWT_SECRET` is missing or shorter than 32 characters. Tests and `scripts/demo.js` generate ephemeral secrets via `crypto.randomBytes(32)`.
- **Algorithm confusion / `alg: none`**: `jwt.verify()` explicitly restricts `algorithms: ['HS256']` and enforces `issuer`.
- **Mass assignment / privilege escalation**: `registerBodySchema` uses `.strict()` and `registerDiner()` hardcodes `role: 'diner'`.
- **Horizontal privilege escalation (IDOR)**: `GET /reservations/:id` and `POST /reservations/:id/cancel` verify `reservation.ownerUserId === req.user.id` unless `req.user.role === 'staff'`.

## Failure Case Demonstrated

1. **Cross-Diner Ownership Violation (`403 FORBIDDEN_OWNERSHIP`)**: Diner Bob attempts `POST /api/v1/reservations/:id/cancel` on Diner Alice's reservation and is blocked before cancellation logic runs.
2. **Expired Bearer Token (`401 TOKEN_EXPIRED`)**: Presenting an expired HS256 token to `GET /api/v1/reservations` is rejected with `TOKEN_EXPIRED`.
3. **Late Diner Cancellation (`422 CANCELLATION_WINDOW_CLOSED`)**: Diner Alice attempting to cancel 75 minutes before `19:30` is rejected under the 2-hour cutoff rule, while a `staff` token succeeds.

## How It Was Tested

```bash
npm install
npm test
npm run demo
```
