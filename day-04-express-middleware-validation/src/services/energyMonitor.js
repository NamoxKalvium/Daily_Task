import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/AppError.js';

const ANOMALY_RULES = [
  {
    type: 'HIGH_POWER_SPIKE',
    check: (r) => r.powerWatts > 15_000,
    severity: (r) => (r.powerWatts > 25_000 ? 'critical' : 'high'),
    describe: (r) => `Power draw ${r.powerWatts}W exceeded 15000W threshold in ${r.facilityZone}.`,
  },
  {
    type: 'VOLTAGE_OUT_OF_RANGE',
    check: (r) => r.voltageVolts < 200 || r.voltageVolts > 255,
    severity: () => 'high',
    describe: (r) => `Line voltage ${r.voltageVolts}V outside nominal 200V-255V band.`,
  },
  {
    type: 'LOW_POWER_FACTOR',
    check: (r) => r.powerWatts > 500 && r.powerFactor < 0.75,
    severity: () => 'medium',
    describe: (r) => `Power factor ${r.powerFactor} dropped below 0.75 under ${r.powerWatts}W load.`,
  },
  {
    type: 'THERMAL_OVERLOAD',
    check: (r) => r.temperatureC !== undefined && r.temperatureC >= 75,
    severity: () => 'critical',
    describe: (r) => `Sensor enclosure temperature reached ${r.temperatureC}C (>= 75C).`,
  },
];

/**
 * In-memory telemetry store and rule-based anomaly detector for the IoT energy dashboard.
 */
export class EnergyMonitorService {
  constructor() {
    this.readings = [];
    this.alerts = new Map();
    this.seenReadingKeys = new Set();
  }

  ingestReading(input) {
    const idempotencyKey = `${input.sensorId}::${new Date(input.timestamp).toISOString()}`;
    if (this.seenReadingKeys.has(idempotencyKey)) {
      throw new AppError({
        statusCode: 409,
        code: 'DUPLICATE_READING',
        message: `Reading already recorded for ${input.sensorId} at ${input.timestamp}.`,
      });
    }

    const reading = {
      readingId: randomUUID(),
      ...input,
      receivedAt: new Date().toISOString(),
    };

    this.seenReadingKeys.add(idempotencyKey);
    this.readings.push(reading);

    const anomaliesTriggered = [];
    for (const rule of ANOMALY_RULES) {
      if (rule.check(reading)) {
        const alert = {
          alertId: randomUUID(),
          readingId: reading.readingId,
          sensorId: reading.sensorId,
          facilityZone: reading.facilityZone,
          type: rule.type,
          severity: rule.severity(reading),
          message: rule.describe(reading),
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          note: null,
          createdAt: new Date().toISOString(),
        };
        this.alerts.set(alert.alertId, alert);
        anomaliesTriggered.push(alert);
      }
    }

    return { reading, anomaliesTriggered };
  }

  listReadings({ sensorId, facilityZone, limit }) {
    return this.readings
      .filter((r) => (!sensorId || r.sensorId === sensorId) && (!facilityZone || r.facilityZone === facilityZone))
      .slice(-limit)
      .reverse();
  }

  listAlerts({ sensorId, severity, acknowledged }) {
    return Array.from(this.alerts.values())
      .filter(
        (a) =>
          (!sensorId || a.sensorId === sensorId) &&
          (!severity || a.severity === severity) &&
          (acknowledged === undefined || a.acknowledged === acknowledged)
      )
      .reverse();
  }

  acknowledgeAlert(alertId, { acknowledgedBy, note }) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new AppError({
        statusCode: 404,
        code: 'ALERT_NOT_FOUND',
        message: `No anomaly alert found for id ${alertId}.`,
      });
    }

    if (alert.acknowledged) {
      throw new AppError({
        statusCode: 409,
        code: 'ALERT_ALREADY_ACKNOWLEDGED',
        message: `Alert ${alertId} was already acknowledged by ${alert.acknowledgedBy}.`,
      });
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date().toISOString();
    alert.note = note ?? null;
    return alert;
  }
}
