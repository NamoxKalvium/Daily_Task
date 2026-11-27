import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('IoT Energy Dashboard API - middleware, validation & error handling', () => {
  let server;
  let baseUrl;
  const logs = [];

  before(async () => {
    const { app } = createApp({
      logger: (line) => logs.push(JSON.parse(line)),
      errorLogger: () => {},
    });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('accepts a valid nominal sensor reading and attaches X-Request-Id + structured log', async () => {
    const customId = 'gw-req-0001';
    const res = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': customId,
      },
      body: JSON.stringify({
        sensorId: 'meter-hvac-01',
        facilityZone: 'hvac',
        timestamp: new Date(Date.now() - 2000).toISOString(),
        powerWatts: 3450,
        voltageVolts: 230,
        currentAmps: 15.5,
        powerFactor: 0.97,
        temperatureC: 36.2,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('x-request-id'), customId);
    assert.equal(body.requestId, customId);
    assert.equal(body.data.reading.sensorId, 'meter-hvac-01');
    assert.equal(body.data.anomaliesTriggered.length, 0);

    const logEntry = logs.find((l) => l.requestId === customId);
    assert.ok(logEntry);
    assert.equal(logEntry.statusCode, 201);
    assert.equal(logEntry.sensorId, 'meter-hvac-01');
  });

  it('triggers anomaly alerts on spike + thermal overload and supports acknowledgement', async () => {
    const res = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sensorId: 'meter-dc-rack-07',
        facilityZone: 'datacenter',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        powerWatts: 27600,
        voltageVolts: 240,
        currentAmps: 120,
        powerFactor: 0.96,
        temperatureC: 81.5,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(body.data.anomaliesTriggered.length, 2);

    const types = body.data.anomaliesTriggered.map((a) => a.type).sort();
    assert.deepEqual(types, ['HIGH_POWER_SPIKE', 'THERMAL_OVERLOAD']);

    const alertId = body.data.anomaliesTriggered[0].alertId;
    const ackRes = await fetch(`${baseUrl}/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        acknowledgedBy: 'oncall-eng-1',
        note: 'Shifted load to backup PDU',
      }),
    });
    const ackBody = await ackRes.json();
    assert.equal(ackRes.status, 200);
    assert.equal(ackBody.data.acknowledged, true);
    assert.equal(ackBody.data.acknowledgedBy, 'oncall-eng-1');
  });

  it('rejects invalid telemetry fields and unknown strict properties with 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sensorId: 'x',
        facilityZone: 'rooftop_unknown',
        timestamp: 'not-a-timestamp',
        powerWatts: -120,
        voltageVolts: 230,
        currentAmps: 10,
        powerFactor: 1.4,
        unexpectedFlag: true,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(body.error.details));
    assert.ok(body.error.details.length >= 4);
    assert.equal(body.requestId, res.headers.get('x-request-id'));
  });

  it('rejects duplicate (sensorId, timestamp) retries with 409 DUPLICATE_READING', async () => {
    const ts = new Date(Date.now() - 5000).toISOString();
    const payload = {
      sensorId: 'meter-solar-02',
      facilityZone: 'solar_inverter',
      timestamp: ts,
      powerWatts: 4200,
      voltageVolts: 232,
      currentAmps: 18.5,
      powerFactor: 0.99,
    };

    const first = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);

    const retry = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const retryBody = await retry.json();
    assert.equal(retry.status, 409);
    assert.equal(retryBody.error.code, 'DUPLICATE_READING');
  });

  it('edge case: catches malformed JSON from express.json() as structured 400 INVALID_JSON with preserved X-Request-Id', async () => {
    const gatewayReqId = 'gw-corrupt-frame-99';
    const res = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': gatewayReqId,
      },
      // Truncated JSON / unquoted NaN from a flaky serial-to-HTTP IoT bridge
      body: '{"sensorId": "meter-hvac-01", "powerWatts": NaN',
    });

    const contentType = res.headers.get('content-type');
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.match(contentType, /application\/json/);
    assert.equal(res.headers.get('x-request-id'), gatewayReqId);
    assert.equal(body.requestId, gatewayReqId);
    assert.equal(body.error.code, 'INVALID_JSON');

    const logEntry = logs.find((l) => l.requestId === gatewayReqId);
    assert.ok(logEntry);
    assert.equal(logEntry.statusCode, 400);
  });

  it('edge case: rejects sensor clock skew > 5 minutes in the future', async () => {
    const futureTs = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/v1/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sensorId: 'meter-grid-01',
        facilityZone: 'main_grid',
        timestamp: futureTs,
        powerWatts: 1200,
        voltageVolts: 230,
        currentAmps: 5.5,
        powerFactor: 0.95,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some((d) => d.field === 'timestamp'));
  });
});
