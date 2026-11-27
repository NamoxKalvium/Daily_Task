import { z } from 'zod';

export const FACILITY_ZONES = ['hvac', 'lighting', 'datacenter', 'solar_inverter', 'main_grid'];
export const ALERT_SEVERITIES = ['medium', 'high', 'critical'];

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SENSOR_ID_REGEX = /^[a-zA-Z0-9_-]{3,40}$/;

export const createReadingBodySchema = z
  .object({
    sensorId: z
      .string()
      .regex(SENSOR_ID_REGEX, 'sensorId must be 3-40 alphanumeric, underscore, or hyphen characters'),
    facilityZone: z.enum(FACILITY_ZONES),
    timestamp: z.string().datetime({ offset: true, message: 'timestamp must be ISO-8601 with timezone offset (e.g. Z)' }),
    powerWatts: z.number().finite().min(0).max(500_000),
    voltageVolts: z.number().finite().min(80).max(500),
    currentAmps: z.number().finite().min(0).max(2_000),
    powerFactor: z.number().finite().min(0).max(1),
    temperatureC: z.number().finite().min(-40).max(120).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const readingMs = Date.parse(data.timestamp);
    if (readingMs > Date.now() + MAX_CLOCK_SKEW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timestamp'],
        message: 'timestamp cannot be more than 5 minutes in the future',
      });
    }

    // Sanity check against apparent power S = V * I (allow 20% tolerance for harmonics/transient lag).
    const apparentPower = data.voltageVolts * data.currentAmps;
    if (apparentPower > 0 && data.powerWatts > apparentPower * 1.2 + 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['powerWatts'],
        message: 'powerWatts exceeds physically plausible apparent power (voltageVolts * currentAmps)',
      });
    }
  });

export const listReadingsQuerySchema = z
  .object({
    sensorId: z.string().regex(SENSOR_ID_REGEX).optional(),
    facilityZone: z.enum(FACILITY_ZONES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const listAlertsQuerySchema = z
  .object({
    sensorId: z.string().regex(SENSOR_ID_REGEX).optional(),
    severity: z.enum(ALERT_SEVERITIES).optional(),
    acknowledged: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
  })
  .strict();

export const alertParamsSchema = z.object({
  alertId: z.string().uuid('alertId must be a valid UUID'),
});

export const acknowledgeAlertBodySchema = z
  .object({
    acknowledgedBy: z.string().trim().min(2).max(60),
    note: z.string().trim().max(240).optional(),
  })
  .strict();
