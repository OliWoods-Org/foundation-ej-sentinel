/**
 * Community Advocacy Toolkit
 *
 * Empowers environmental justice communities with data-driven advocacy tools,
 * report generation, and organizing support for environmental campaigns.
 *
 * @module community-advocacy
 * @license GPL-3.0
 * @author OliWoods Foundation
 */

import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const CommunityReportSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  communityName: z.string(),
  generatedDate: z.string().datetime(),
  summary: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    dataPoints: z.array(z.object({ label: z.string(), value: z.string(), source: z.string() })),
  })),
  recommendations: z.array(z.string()),
  targetAudience: z.enum(['community-members', 'local-government', 'state-agency', 'federal-agency', 'media', 'legal']),
});

export const IncidentReportSchema = z.object({
  id: z.string().uuid(),
  reporterName: z.string().optional(),
  reporterContact: z.string().optional(),
  anonymous: z.boolean().default(false),
  incidentDate: z.string().datetime(),
  location: z.object({ lat: z.number(), lng: z.number(), description: z.string() }),
  type: z.enum(['odor', 'visible-emissions', 'water-discharge', 'noise', 'dust', 'spill', 'illegal-dumping', 'health-symptoms', 'other']),
  description: z.string(),
  severity: z.enum(['low', 'moderate', 'high', 'emergency']),
  healthSymptomsReported: z.array(z.string()).default([]),
  photoEvidence: z.array(z.string()).default([]),
  weatherConditions: z.string().optional(),
  windDirection: z.string().optional(),
  suspectedSource: z.string().optional(),
  submittedAt: z.string().datetime(),
  agenciesNotified: z.array(z.string()).default([]),
});

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  goal: z.string(),
  communityName: z.string(),
  status: z.enum(['planning', 'active', 'won', 'lost', 'ongoing']),
  startDate: z.string().datetime(),
  milestones: z.array(z.object({
    title: z.string(),
    targetDate: z.string(),
    completed: z.boolean(),
    notes: z.string().optional(),
  })),
  supporters: z.number().int().nonnegative(),
  actions: z.array(z.object({
    type: z.enum(['petition', 'public-comment', 'hearing-testimony', 'media-outreach', 'legal-action', 'community-meeting', 'data-collection']),
    description: z.string(),
    deadline: z.string().optional(),
    assignee: z.string().optional(),
  })),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type CommunityReport = z.infer<typeof CommunityReportSchema>;
export type IncidentReport = z.infer<typeof IncidentReportSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Generate a comprehensive environmental justice community report
 * suitable for submission to regulatory agencies or elected officials.
 */
export function generateCommunityReport(
  communityName: string,
  burdenData: { cumulativeBurdenScore: number; ejScreenPercentile: number; demographics: Record<string, number>; healthOutcomes: Record<string, number> },
  incidents: IncidentReport[],
  targetAudience: CommunityReport['targetAudience'],
): CommunityReport {
  const sections: CommunityReport['sections'] = [];

  // Demographics section
  sections.push({
    heading: 'Community Demographics and Vulnerability',
    content: `${communityName} is a community that bears a disproportionate environmental burden, ranking in the ${burdenData.ejScreenPercentile}th percentile on the EJScreen cumulative impact index.`,
    dataPoints: Object.entries(burdenData.demographics).map(([label, value]) => ({
      label: label.replace(/([A-Z])/g, ' $1').replace(/percent/i, '').trim(),
      value: `${value}%`,
      source: 'US Census / EJScreen',
    })),
  });

  // Health outcomes section
  sections.push({
    heading: 'Health Outcomes',
    content: `Residents of ${communityName} experience elevated rates of environmentally-linked health conditions compared to state and national averages.`,
    dataPoints: Object.entries(burdenData.healthOutcomes).map(([label, value]) => ({
      label: label.replace(/([A-Z])/g, ' $1').trim(),
      value: typeof value === 'number' ? `${value}%` : String(value),
      source: 'CDC PLACES / State Health Department',
    })),
  });

  // Incidents section
  if (incidents.length > 0) {
    const byType = new Map<string, number>();
    for (const inc of incidents) {
      byType.set(inc.type, (byType.get(inc.type) || 0) + 1);
    }

    sections.push({
      heading: 'Community-Reported Environmental Incidents',
      content: `Community members have documented ${incidents.length} environmental incidents, including ${Array.from(byType.entries()).map(([t, c]) => `${c} ${t.replace(/-/g, ' ')} reports`).join(', ')}.`,
      dataPoints: Array.from(byType.entries()).map(([type, count]) => ({
        label: type.replace(/-/g, ' '),
        value: String(count),
        source: 'Community Reports',
      })),
    });
  }

  const recommendations = [
    'Conduct a comprehensive cumulative impact analysis for all permitted facilities in the area',
    'Install continuous air quality monitors in the community with real-time public access',
    'Require enhanced community notification for any permit applications or modifications',
    'Establish a community advisory board with meaningful authority in permitting decisions',
    'Fund a community health study to quantify the relationship between local pollution sources and health outcomes',
  ];

  return CommunityReportSchema.parse({
    id: crypto.randomUUID(),
    title: `Environmental Justice Assessment: ${communityName}`,
    communityName,
    generatedDate: new Date().toISOString(),
    summary: `${communityName} ranks in the ${burdenData.ejScreenPercentile}th percentile for cumulative environmental burden with a score of ${burdenData.cumulativeBurdenScore}/100. Community members have documented ${incidents.length} environmental incidents. This report provides data-driven evidence of disproportionate environmental burden and health impacts.`,
    sections,
    recommendations,
    targetAudience,
  });
}

/**
 * Create a structured incident report for submission to environmental agencies.
 */
export function createIncidentReport(
  type: IncidentReport['type'],
  description: string,
  location: { lat: number; lng: number; description: string },
  severity: IncidentReport['severity'],
  options: {
    reporterName?: string;
    anonymous?: boolean;
    healthSymptoms?: string[];
    suspectedSource?: string;
    weatherConditions?: string;
    windDirection?: string;
  } = {},
): IncidentReport {
  const agenciesToNotify: string[] = [];

  if (severity === 'emergency') {
    agenciesToNotify.push('911', 'National Response Center (1-800-424-8802)');
  }
  if (['visible-emissions', 'odor'].includes(type)) {
    agenciesToNotify.push('State Air Quality Agency', 'EPA Region Office');
  }
  if (['water-discharge', 'spill'].includes(type)) {
    agenciesToNotify.push('State Water Quality Agency', 'EPA Clean Water Act Hotline');
  }
  if (type === 'illegal-dumping') {
    agenciesToNotify.push('Local Code Enforcement', 'State Environmental Agency');
  }

  return IncidentReportSchema.parse({
    id: crypto.randomUUID(),
    reporterName: options.anonymous ? undefined : options.reporterName,
    anonymous: options.anonymous || false,
    incidentDate: new Date().toISOString(),
    location,
    type,
    description,
    severity,
    healthSymptomsReported: options.healthSymptoms || [],
    weatherConditions: options.weatherConditions,
    windDirection: options.windDirection,
    suspectedSource: options.suspectedSource,
    submittedAt: new Date().toISOString(),
    agenciesNotified: agenciesToNotify,
  });
}

/**
 * Calculate an environmental justice score comparing a community to state/national baselines.
 */
export function calculateEJScore(
  communityMetrics: Record<string, number>,
  stateBaselines: Record<string, number>,
): { score: number; disparities: Array<{ metric: string; communityValue: number; baseline: number; ratio: number }> } {
  const disparities: Array<{ metric: string; communityValue: number; baseline: number; ratio: number }> = [];

  for (const [metric, value] of Object.entries(communityMetrics)) {
    const baseline = stateBaselines[metric];
    if (baseline && baseline > 0) {
      const ratio = value / baseline;
      if (ratio > 1.2) {
        disparities.push({ metric, communityValue: value, baseline, ratio: Math.round(ratio * 100) / 100 });
      }
    }
  }

  disparities.sort((a, b) => b.ratio - a.ratio);

  const avgRatio = disparities.length > 0
    ? disparities.reduce((s, d) => s + d.ratio, 0) / disparities.length
    : 1;

  return {
    score: Math.min(100, Math.round((avgRatio - 1) * 50)),
    disparities,
  };
}
