import { createApp } from '../src/app.js';

const { app } = createApp();

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});

const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

async function runCase(label, path, options) {
  console.log(`\n=== ${label} ===`);
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json();
  console.log(`Status: ${res.status} | X-Request-Id: ${res.headers.get('x-request-id')}`);
  console.log(JSON.stringify(data, null, 2));
}

try {
  // 1. Valid nominal reading
  await runCase('1. VALID NOMINAL READING', '/api/v1/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'demo-valid-001' },
    body: JSON.stringify({
      sensorId: 'meter-hvac-01',
      facilityZone: 'hvac',
      timestamp: new Date(Date.now() - 3000).toISOString(),
      powerWatts: 3200,
      voltageVolts: 231,
      currentAmps: 14.2,
      powerFactor: 0.97,
      temperatureC: 35.4,
    }),
  });

  // 2. Valid reading triggering IoT energy anomaly alerts
  await runCase('2. VALID ANOMALOUS READING (SPIKE + LOW POWER FACTOR)', '/api/v1/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'demo-anomaly-002' },
    body: JSON.stringify({
      sensorId: 'meter-dc-rack-04',
      facilityZone: 'datacenter',
      timestamp: new Date(Date.now() - 2000).toISOString(),
      powerWatts: 18400,
      voltageVolts: 242,
      currentAmps: 112,
      powerFactor: 0.68,
      temperatureC: 62.0,
    }),
  });

  // 3. Invalid payload (negative power, invalid zone, physics mismatch)
  await runCase('3. INVALID REQUEST (SCHEMA + DOMAIN VALIDATION)', '/api/v1/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'demo-invalid-003' },
    body: JSON.stringify({
      sensorId: 'meter-dc-rack-04',
      facilityZone: 'parking_lot',
      timestamp: '2026-11-27',
      powerWatts: -50,
      voltageVolts: 40,
      currentAmps: 10,
      powerFactor: 1.5,
    }),
  });

  // 4. Edge case: malformed/truncated JSON from IoT gateway before route validation runs
  await runCase('4. EDGE CASE (TRUNCATED / MALFORMED JSON WITH PRESERVED REQUEST ID)', '/api/v1/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'demo-edge-json-004' },
    body: '{"sensorId": "meter-hvac-01", "powerWatts": NaN',
  });
} finally {
  server.close();
}
