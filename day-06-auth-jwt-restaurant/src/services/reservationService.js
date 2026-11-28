import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

export const TIME_SLOTS = ['18:00', '19:30', '21:00'];
export const SLOT_CAPACITY = 20;
export const MAX_PARTY_SIZE = 8;
export const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000;

function slotStartTimestampMs(dateStr, timeSlot) {
  return Date.parse(`${dateStr}T${timeSlot}:00.000Z`);
}

/**
 * In-memory user store and restaurant reservation engine enforcing
 * party size bounds, seat availability, ownership, and cancellation cutoffs.
 */
export class ReservationService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.usersByEmail = new Map();
    this.reservations = new Map();
  }

  async seedUser({ id, email, name, password, role }) {
    const normalizedEmail = email.toLowerCase();
    const passwordHash = await hashPassword(password);
    const user = {
      id: id ?? `usr_${randomUUID().slice(0, 8)}`,
      email: normalizedEmail,
      name,
      role,
      passwordHash,
      createdAt: new Date(this.now()).toISOString(),
    };
    this.usersByEmail.set(normalizedEmail, user);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async registerDiner({ email, name, password }) {
    const normalizedEmail = email.toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new AppError({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists.',
      });
    }
    // Always enforce least-privilege role ('diner') on self-registration.
    return this.seedUser({ email: normalizedEmail, name, password, role: 'diner' });
  }

  async authenticateUser({ email, password }) {
    const user = this.usersByEmail.get(email.toLowerCase());
    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  getAvailability({ date, partySize = 1 }) {
    return TIME_SLOTS.map((timeSlot) => {
      const bookedSeats = Array.from(this.reservations.values())
        .filter((r) => r.date === date && r.timeSlot === timeSlot && r.status !== 'cancelled')
        .reduce((sum, r) => sum + r.partySize, 0);

      const remainingSeats = Math.max(0, SLOT_CAPACITY - bookedSeats);
      return {
        date,
        timeSlot,
        capacity: SLOT_CAPACITY,
        bookedSeats,
        remainingSeats,
        canAccommodate: partySize <= MAX_PARTY_SIZE && remainingSeats >= partySize,
      };
    });
  }

  createReservation({ ownerUserId, guestName, date, timeSlot, partySize, notes }) {
    const slotMs = slotStartTimestampMs(date, timeSlot);
    if (slotMs <= this.now()) {
      throw new AppError({
        statusCode: 422,
        code: 'SLOT_IN_PAST',
        message: 'Cannot reserve a seating slot in the past.',
      });
    }

    const availability = this.getAvailability({ date, partySize }).find(
      (s) => s.timeSlot === timeSlot
    );

    if (!availability || !availability.canAccommodate) {
      throw new AppError({
        statusCode: 409,
        code: 'INSUFFICIENT_AVAILABILITY',
        message: `Slot ${date} ${timeSlot} cannot accommodate party of ${partySize} (${availability?.remainingSeats ?? 0} seats remaining).`,
      });
    }

    const reservation = {
      id: `res_${randomUUID().slice(0, 8)}`,
      ownerUserId,
      guestName,
      date,
      timeSlot,
      partySize,
      notes: notes ?? null,
      status: 'confirmed',
      cancelledBy: null,
      cancelledAt: null,
      createdAt: new Date(this.now()).toISOString(),
    };

    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  listReservations({ actor, date, status }) {
    return Array.from(this.reservations.values()).filter((r) => {
      if (actor.role !== 'staff' && r.ownerUserId !== actor.id) return false;
      if (date && r.date !== date) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  getReservationById({ reservationId, actor }) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new AppError({
        statusCode: 404,
        code: 'RESERVATION_NOT_FOUND',
        message: `Reservation ${reservationId} not found.`,
      });
    }

    if (actor.role !== 'staff' && reservation.ownerUserId !== actor.id) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN_OWNERSHIP',
        message: 'You can only view reservations that belong to your account.',
      });
    }

    return reservation;
  }

  cancelReservation({ reservationId, actor }) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new AppError({
        statusCode: 404,
        code: 'RESERVATION_NOT_FOUND',
        message: `Reservation ${reservationId} not found.`,
      });
    }

    // Ownership check: diners may only cancel their own reservations; staff may cancel any.
    if (actor.role !== 'staff' && reservation.ownerUserId !== actor.id) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN_OWNERSHIP',
        message: 'Access denied: you do not own this reservation.',
      });
    }

    if (reservation.status === 'cancelled') {
      throw new AppError({
        statusCode: 409,
        code: 'ALREADY_CANCELLED',
        message: 'Reservation is already cancelled.',
      });
    }

    if (reservation.status === 'seated') {
      throw new AppError({
        statusCode: 409,
        code: 'ALREADY_SEATED',
        message: 'Cannot cancel a party that is already seated.',
      });
    }

    // Cancellation cutoff rule: diners cannot cancel within 2 hours of seating; staff can override.
    const slotMs = slotStartTimestampMs(reservation.date, reservation.timeSlot);
    if (actor.role !== 'staff' && slotMs - this.now() < CANCELLATION_CUTOFF_MS) {
      throw new AppError({
        statusCode: 422,
        code: 'CANCELLATION_WINDOW_CLOSED',
        message:
          'Diners must cancel at least 2 hours before the seating slot. Please call restaurant staff for assistance.',
      });
    }

    reservation.status = 'cancelled';
    reservation.cancelledBy = actor.id;
    reservation.cancelledAt = new Date(this.now()).toISOString();
    return reservation;
  }

  markSeated({ reservationId }) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new AppError({
        statusCode: 404,
        code: 'RESERVATION_NOT_FOUND',
        message: `Reservation ${reservationId} not found.`,
      });
    }
    if (reservation.status !== 'confirmed') {
      throw new AppError({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot seat reservation in "${reservation.status}" status.`,
      });
    }
    reservation.status = 'seated';
    return reservation;
  }
}
