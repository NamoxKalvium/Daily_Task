import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

// Generate ephemeral secret at runtime; never commit static JWT secrets.
const runtimeSecret = randomBytes(32).toString('hex');
const fixedClockMs = Date.parse('2026-12-01T15:00:00.000Z');

const { app, reservationService } = createApp({
  jwtSecret: runtimeSecret,
  jwtExpiresIn: '15m',
  now: () => fixedClockMs,
});

await reservationService.seedUser({
  id: 'usr_staff_host',
  email: 'host@bistro.test',
  name: 'Restaurant Host',
  password: 'HostDemoPassword!1',
  role: 'staff',
});
await reservationService.seedUser({
  id: 'usr_diner_bob',
  email: 'bob@diner.test',
  name: 'Bob Diner',
  password: 'BobDemoPassword!1',
  role: 'diner',
});

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function call(label, path, options = {}) {
  console.log(`\n=== ${label} ===`);
  const res = await fetch(`${baseUrl}${path}`, options);
  const body = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
  return { status: res.status, body };
}

try {
  // 1. Register Diner Alice
  const reg = await call('1. REGISTER DINER ALICE (SCRYPT HASH + JWT)', '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'alice@diner.test',
      name: 'Alice Diner',
      password: 'AliceDemoPassword!1',
    }),
  });
  const aliceToken = reg.body.accessToken;

  // 2. Book reservation as Alice
  const created = await call('2. PROTECTED CREATE RESERVATION (ALICE)', '/api/v1/reservations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      guestName: 'Alice & Friends',
      date: '2026-12-01',
      timeSlot: '18:00',
      partySize: 4,
      notes: 'Window table',
    }),
  });
  const reservationId = created.body.reservation.id;

  // 3. Failure case A: Diner Bob tries to cancel Alice's reservation (403 FORBIDDEN_OWNERSHIP)
  const bobLogin = await call('3. LOGIN DINER BOB', '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@diner.test', password: 'BobDemoPassword!1' }),
  });
  await call(
    '4. FAILURE CASE: BOB ATTEMPTS TO CANCEL ALICE RESERVATION (403 OWNERSHIP)',
    `/api/v1/reservations/${reservationId}/cancel`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${bobLogin.body.accessToken}` },
    }
  );

  // 4. Failure case B: Expired JWT rejected (401 TOKEN_EXPIRED)
  const expiredToken = jwt.sign(
    { role: 'diner', email: 'alice@diner.test', name: 'Alice Diner' },
    runtimeSecret,
    { algorithm: 'HS256', subject: 'usr_alice', issuer: 'restaurant-reservation-api', expiresIn: -5 }
  );
  await call('5. FAILURE CASE: EXPIRED JWT REJECTED (401 TOKEN_EXPIRED)', '/api/v1/reservations', {
    headers: { authorization: `Bearer ${expiredToken}` },
  });

  // 5. Staff login + role-authorized seating
  const staffLogin = await call('6. LOGIN RESTAURANT STAFF', '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'host@bistro.test', password: 'HostDemoPassword!1' }),
  });
  await call(
    '7. STAFF ROLE SEATS ALICE RESERVATION (200 OK)',
    `/api/v1/reservations/${reservationId}/seat`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${staffLogin.body.accessToken}` },
    }
  );
} finally {
  server.close();
}
