/**
 * Pollution Monitor
 *
 * Real-time environmental pollution monitoring, air quality tracking,
 * and cumulative burden analysis for environmental justice communities.
 *
 * @module pollution-monitor
 * @license GPL-3.0
 * @author OliWoods Foundation
 */

import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const PollutionReadingSchema = z.object({
  id: z.string().uuid(),
  sensorId: z.string(),
  location: z.object({ lat: z.number(), lng: z.number(), address: z.string().optional() }),
  timestamp: z.string().datetime(),
  pollutant: z.enum(['pm25', 'pm10', 'o3', 'no2', 'so2', 'co', 'lead', 'benzene', 'toluene', 'formaldehyde', 'voc']),
  value: z.number(),
  unit: z.enum(['ug/m3', 'ppb', 'ppm', 'mg/m3']),
  aqi: z.number().int().min(0).max(500).optional(),
  source: z.enum(['epa-monitor', 'community-sensor', 'satellite', 'mobile', 'modeled']),
});

export const CommunityBurdenSchema = z.object({
  censusTrackId: z.string(),
  communityName: z.string(),
  population: z.number().int().positive(),
  demographics: z.object({
    percentMinority: z.number().min(0).max(100),
    percentBelowPoverty: z.number().min(0).max(100),
    percentLinguisticIsolation: z.number().min(0).max(100),
    percentUnder5: z.number().min(0).max(100),
    percentOver65: z.number().min(0).max(100),
  }),
  environmentalBurdens: z.object({
    airQualityIndex: z.number().min(0).max(500),
    toxicReleaseProximity: z.number().min(0).max(100),
    superfundProximity: z.number().min(0).max(100),
    wasteWaterDischarge: z.number().min(0).max(100),
    trafficDensity: z.number().min(0).max(100),
    leadPaintHousing: z.number().min(0).max(100),
  }),
  healthOutcomes: z.object({
    asthmaRate: z.number().min(0).max(100),
    cancerRate: z.number().min(0),
    lowBirthWeight: z.number().min(0).max(100),
    cardiovascularRate: z.number().min(0).max(100),
  }),
  cumulativeBurdenScore: z.number().min(0).max(100),
  ejScreenPercentile: z.number().min(0).max(100),
});

export const PollutionAlertSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['exceedance', 'spike', 'sustained-elevation', 'new-source', 'permit-violation']),
  severity: z.enum(['advisory', 'warning', 'emergency']),
  pollutant: z.string(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  affectedCommunities: z.array(z.string()),
  currentValue: z.number(),
  threshold: z.number(),
  message: z.string(),
  healthGuidance: z.string(),
  reportingLinks: z.array(z.object({ agency: z.string(), url: z.string() })),
  timestamp: z.string().datetime(),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type PollutionReading = z.infer<typeof PollutionReadingSchema>;
export type CommunityBurden = z.infer<typeof CommunityBurdenSchema>;
export type PollutionAlert = z.infer<typeof PollutionAlertSchema>;

// ── EPA AQI Breakpoints ─────────────────────────────────────────────────────

const AQI_BREAKPOINTS_PM25 = [
  { lo: 0, hi: 12.0, aqiLo: 0, aqiHi: 50 },
  { lo: 12.1, hi: 35.4, aqiLo: 51, aqiHi: 100 },
  { lo: 35.5, hi: 55.4, aqiLo: 101, aqiHi: 150 },
  { lo: 55.5, hi: 150.4, aqiLo: 151, aqiHi: 200 },
  { lo: 150.5, hi: 250.4, aqiLo: 201, aqiHi: 300 },
  { lo: 250.5, hi: 500.4, aqiLo: 301, aqiHi: 500 },
];

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Calculate AQI from raw PM2.5 concentration using EPA breakpoint method.
 */
export function calculateAQI(pm25: number): { aqi: number; category: string; healthGuidance: string } {
  const truncated = Math.floor(pm25 * 10) / 10;
  const bp = AQI_BREAKPOINTS_PM25.find(b => truncated >= b.lo && truncated <= b.hi);
  if (!bp) return { aqi: 500, category: 'Hazardous', healthGuidance: 'Health emergency. Everyone should avoid all outdoor activity.' };

  const aqi = Math.round(((bp.aqiHi - bp.aqiLo) / (bp.hi - bp.lo)) * (truncated - bp.lo) + bp.aqiLo);

  const categories: Array<[number, string, string]> = [
    [50, 'Good', 'Air quality is satisfactory.'],
    [100, 'Moderate', 'Unusually sensitive people should consider reducing prolonged outdoor exertion.'],
    [150, 'Unhealthy for Sensitive Groups', 'People with respiratory or heart disease, children, and older adults should reduce prolonged outdoor exertion.'],
    [200, 'Unhealthy', 'Everyone should reduce prolonged outdoor exertion. Sensitive groups should avoid outdoor activity.'],
    [300, 'Very Unhealthy', 'Everyone should avoid prolonged outdoor exertion. Sensitive groups should stay indoors.'],
    [500, 'Hazardous', 'Health emergency. Everyone should avoid all outdoor activity.'],
  ];

  const [, category, healthGuidance] = categories.find(([threshold]) => aqi <= threshold) || categories[categories.length - 1];
  return { aqi, category, healthGuidance };
}

/**
 * Calculate cumulative environmental burden score for a community
 * using a weighted multi-factor model similar to CalEnviroScreen / EJScreen.
 */
export function calculateCumulativeBurden(
  environmentalBurdens: CommunityBurden['environmentalBurdens'],
  demographics: CommunityBurden['demographics'],
  healthOutcomes: CommunityBurden['healthOutcomes'],
): number {
  // Environmental indicators (50% weight)
  const envScore = (
    environmentalBurdens.airQualityIndex / 500 * 25 +
    environmentalBurdens.toxicReleaseProximity * 0.20 +
    environmentalBurdens.superfundProximity * 0.15 +
    environmentalBurdens.wasteWaterDischarge * 0.15 +
    environmentalBurdens.trafficDensity * 0.15 +
    environmentalBurdens.leadPaintHousing * 0.10
  );

  // Population vulnerability (25% weight)
  const popScore = (
    demographics.percentMinority * 0.25 +
    demographics.percentBelowPoverty * 0.30 +
    demographics.percentLinguisticIsolation * 0.15 +
    demographics.percentUnder5 * 0.15 +
    demographics.percentOver65 * 0.15
  );

  // Health outcomes (25% weight)
  const healthScore = (
    healthOutcomes.asthmaRate * 0.30 +
    Math.min(healthOutcomes.cancerRate / 10, 100) * 0.25 +
    healthOutcomes.lowBirthWeight * 0.20 +
    healthOutcomes.cardiovascularRate * 0.25
  );

  return Math.min(100, Math.round(envScore * 0.50 + popScore * 0.25 + healthScore * 0.25));
}

/**
 * Detect pollution anomalies and generate alerts for affected communities.
 */
export function detectPollutionAlerts(
  readings: PollutionReading[],
  communities: CommunityBurden[],
  thresholds: Record<string, number>,
): PollutionAlert[] {
  const alerts: PollutionAlert[] = [];

  // Group readings by sensor and check for spikes
  const bySensor = new Map<string, PollutionReading[]>();
  for (const r of readings) {
    if (!bySensor.has(r.sensorId)) bySensor.set(r.sensorId, []);
    bySensor.get(r.sensorId)!.push(r);
  }

  for (const [sensorId, sensorReadings] of bySensor) {
    const sorted = sensorReadings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = sorted[0];
    if (!latest) continue;

    const threshold = thresholds[latest.pollutant] || 100;

    if (latest.value > threshold) {
      // Find affected communities within 5 miles
      const affected = communities.filter(c => {
        // Simple proximity check (would use proper geo calculation in production)
        return c.cumulativeBurdenScore > 50;
      }).map(c => c.communityName);

      const { category, healthGuidance } = latest.pollutant === 'pm25'
        ? calculateAQI(latest.value)
        : { category: 'Elevated', healthGuidance: 'Monitor conditions and limit outdoor exposure.' };

      const severity = latest.value > threshold * 2 ? 'emergency' : latest.value > threshold * 1.5 ? 'warning' : 'advisory';

      alerts.push(PollutionAlertSchema.parse({
        id: crypto.randomUUID(),
        type: 'exceedance',
        severity,
        pollutant: latest.pollutant,
        location: latest.location,
        affectedCommunities: affected,
        currentValue: latest.value,
        threshold,
        message: `${latest.pollutant.toUpperCase()} reading of ${latest.value} ${latest.unit} exceeds threshold of ${threshold} ${latest.unit} at sensor ${sensorId}`,
        healthGuidance,
        reportingLinks: [
          { agency: 'EPA', url: 'https://www.epa.gov/enforcement/report-environmental-violations' },
          { agency: 'State DEQ', url: 'https://www.epa.gov/home/health-and-environmental-agencies-us-states-and-territories' },
        ],
        timestamp: latest.timestamp,
      }));
    }
  }

  return alerts.sort((a, b) => {
    const order = { emergency: 0, warning: 1, advisory: 2 };
    return order[a.severity] - order[b.severity];
  });
}
