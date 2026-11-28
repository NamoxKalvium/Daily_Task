import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

describe('Restaurant Reservation Auth & Authorization API', () => {
  const jwtSecret = randomBytes(32).toString('hex');
  // Fixed clock: 2026-12-01T15:00:00.000Z (3h before 18:00, 4.5h before 19:30)
  let currentNowMs = Date.parse('2026-12-01T15:00:00.000Z');
  let server;
  let baseUrl;
  let reservationService;

  let dinerAToken;
  let dinerBToken;
  let staffToken;

  before(async () => {
    const created = createApp({
      jwtSecret,
      jwtExpiresIn: '15m',
      now: () => currentNowMs,
    });
    reservationService = created.reservationService;

    // Seed staff account & second diner (all passwords hashed via scrypt)
    await reservationService.seedUser({
      id: 'usr_staff_01',
      email: 'host@bistro.test',
      name: 'Host Manager',
      password: 'StaffPassword!2026',
      role: 'staff',
    });
    await reservationService.seedUser({
      id: 'usr_diner_b',
      email: 'bob@diner.test',
      name: 'Bob Diner',
      password: 'BobPassword!2026',
      role: 'diner',
    });

    await new Promise((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Register Diner A via HTTP endpoint
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@diner.test',
        name: 'Alice Diner',
        password: 'AlicePassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.user.role, 'diner');
    dinerAToken = regBody.accessToken;

    // Login Diner B and Staff
    const bobLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bob@diner.test', password: 'BobPassword!2026' }),
    });
    dinerBToken = (await bobLogin.json()).accessToken;

    const staffLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'host@bistro.test', password: 'StaffPassword!2026' }),
    });
    staffToken = (await staffLogin.json()).accessToken;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('fails closed at startup if JWT_SECRET is missing or weak', () => {
    assert.throws(() => createApp({ jwtSecret: 'too-short' }), /JWT_SECRET/);
  });

  it('rejects wrong password login with 401 INVALID_CREDENTIALS', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@diner.test', password: 'WrongPassword123' }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('blocks unauthenticated requests and rejects expired JWT tokens with 401 TOKEN_EXPIRED', async () => {
    const noAuthRes = await fetch(`${baseUrl}/api/v1/reservations`);
    assert.equal(noAuthRes.status, 401);
    assert.equal((await noAuthRes.json()).error.code, 'AUTHENTICATION_REQUIRED');

    const expiredToken = jwt.sign(
      { role: 'diner', email: 'alice@diner.test', name: 'Alice Diner' },
      jwtSecret,
      {
        algorithm: 'HS256',
        subject: 'usr_expired',
        issuer: 'restaurant-reservation-api',
        expiresIn: -10,
      }
    );

    const expiredRes = await fetch(`${baseUrl}/api/v1/reservations`, {
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const expiredBody = await expiredRes.json();
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredBody.error.code, 'TOKEN_EXPIRED');
  });

  it('enforces party size, seat availability, ownership checks, and staff-only seating', async () => {
    // 1. Diner A books party of 6 at 18:00 (20 -> 14 seats remaining)
    const createRes = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${dinerAToken}`,
      },
      body: JSON.stringify({
        guestName: 'Alice Party',
        date: '2026-12-01',
        timeSlot: '18:00',
        partySize: 6,
      }),
    });
    assert.equal(createRes.status, 201);
    const aliceReservationId = (await createRes.json()).reservation.id;

    // 2. Public availability reflects updated seats (14 remaining at 18:00)
    const availRes = await fetch(`${baseUrl}/api/v1/availability?date=2026-12-01&partySize=8`);
    const availBody = await availRes.json();
    const slot1800 = availBody.slots.find((s) => s.timeSlot === '18:00');
    assert.equal(slot1800.remainingSeats, 14);
    assert.equal(slot1800.canAccommodate, true);

    // 3. Ownership failure case: Diner B cannot view or cancel Diner A's reservation
    const viewForbidden = await fetch(`${baseUrl}/api/v1/reservations/${aliceReservationId}`, {
      headers: { authorization: `Bearer ${dinerBToken}` },
    });
    assert.equal(viewForbidden.status, 403);
    assert.equal((await viewForbidden.json()).error.code, 'FORBIDDEN_OWNERSHIP');

    const cancelForbidden = await fetch(
      `${baseUrl}/api/v1/reservations/${aliceReservationId}/cancel`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${dinerBToken}` },
      }
    );
    assert.equal(cancelForbidden.status, 403);
    assert.equal((await cancelForbidden.json()).error.code, 'FORBIDDEN_OWNERSHIP');

    // 4. Role check: Diner A cannot mark their own reservation as seated
    const seatForbidden = await fetch(
      `${baseUrl}/api/v1/reservations/${aliceReservationId}/seat`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${dinerAToken}` },
      }
    );
    assert.equal(seatForbidden.status, 403);
    assert.equal((await seatForbidden.json()).error.code, 'FORBIDDEN_ROLE');

    // 5. Staff CAN view all reservations and mark seated
    const staffList = await fetch(`${baseUrl}/api/v1/reservations`, {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffList.status, 200);
    assert.equal((await staffList.json()).count, 1);

    const staffSeat = await fetch(
      `${baseUrl}/api/v1/reservations/${aliceReservationId}/seat`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${staffToken}` },
      }
    );
    assert.equal(staffSeat.status, 200);
    assert.equal((await staffSeat.json()).reservation.status, 'seated');
  });

  it('enforces 2-hour diner cancellation cutoff while allowing staff override', async () => {
    // Book for 19:30 (currently 15:00 -> 4.5h ahead)
    const createRes = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${dinerAToken}`,
      },
      body: JSON.stringify({
        guestName: 'Alice Late Check',
        date: '2026-12-01',
        timeSlot: '19:30',
        partySize: 4,
      }),
    });
    const resId = (await createRes.json()).reservation.id;

    // Advance clock to 18:15 (1h 15m before 19:30 -> inside 2h cutoff)
    currentNowMs = Date.parse('2026-12-01T18:15:00.000Z');

    const dinerCancel = await fetch(`${baseUrl}/api/v1/reservations/${resId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${dinerAToken}` },
    });
    assert.equal(dinerCancel.status, 422);
    assert.equal((await dinerCancel.json()).error.code, 'CANCELLATION_WINDOW_CLOSED');

    // Staff overrides late cancellation cleanly
    const staffCancel = await fetch(`${baseUrl}/api/v1/reservations/${resId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffCancel.status, 200);
    assert.equal((await staffCancel.json()).reservation.status, 'cancelled');
  });
});
