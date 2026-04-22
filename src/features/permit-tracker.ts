/**
 * Permit Tracker
 *
 * Tracks environmental permits, compliance violations, and enforcement actions
 * for industrial facilities near environmental justice communities. Enables
 * community participation in permit review processes.
 *
 * @module permit-tracker
 * @license GPL-3.0
 * @author OliWoods Foundation
 */

import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const FacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'power-plant', 'refinery', 'chemical-plant', 'waste-treatment',
    'incinerator', 'landfill', 'mining', 'manufacturing', 'warehouse-distribution',
    'confined-animal-feeding', 'other',
  ]),
  address: z.object({ street: z.string(), city: z.string(), state: z.string(), zip: z.string(), lat: z.number(), lng: z.number() }),
  operator: z.string(),
  parentCompany: z.string().optional(),
  naicsCode: z.string().optional(),
  epaRegistryId: z.string().optional(),
  triReporter: z.boolean(),
});

export const PermitSchema = z.object({
  id: z.string(),
  facilityId: z.string(),
  type: z.enum(['air', 'water-npdes', 'hazardous-waste-rcra', 'stormwater', 'underground-injection', 'solid-waste']),
  permitNumber: z.string(),
  issuedDate: z.string().datetime(),
  expirationDate: z.string().datetime(),
  status: z.enum(['active', 'expired', 'pending-renewal', 'under-review', 'revoked', 'draft']),
  authorizedEmissions: z.array(z.object({
    pollutant: z.string(),
    maxAmount: z.number(),
    unit: z.string(),
    period: z.enum(['hourly', 'daily', 'annual']),
  })),
  publicCommentDeadline: z.string().datetime().optional(),
  publicHearingDate: z.string().datetime().optional(),
  documents: z.array(z.object({ title: z.string(), url: z.string() })),
});

export const ViolationSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string(),
  permitId: z.string().optional(),
  type: z.enum(['emission-exceedance', 'reporting-failure', 'permit-condition', 'spill-release', 'monitoring-failure', 'operational']),
  severity: z.enum(['minor', 'significant', 'high-priority']),
  description: z.string(),
  discoveredDate: z.string().datetime(),
  resolvedDate: z.string().datetime().optional(),
  enforcementAction: z.enum(['none', 'warning', 'notice-of-violation', 'consent-order', 'penalty', 'lawsuit', 'permit-revocation']).optional(),
  penaltyAmount: z.number().nonnegative().optional(),
  pollutantsInvolved: z.array(z.string()),
  affectedMedia: z.array(z.enum(['air', 'water', 'soil', 'groundwater'])),
});

export const CommunityCommentSchema = z.object({
  id: z.string().uuid(),
  permitId: z.string(),
  authorName: z.string(),
  authorOrganization: z.string().optional(),
  submittedDate: z.string().datetime(),
  concerns: z.array(z.string()),
  requestedActions: z.array(z.string()),
  supportingEvidence: z.array(z.string()),
  status: z.enum(['draft', 'submitted', 'acknowledged', 'addressed']),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type Facility = z.infer<typeof FacilitySchema>;
export type Permit = z.infer<typeof PermitSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type CommunityComment = z.infer<typeof CommunityCommentSchema>;

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Find facilities with active permits near a location and assess their
 * compliance history.
 */
export function findNearbyFacilities(
  location: { lat: number; lng: number },
  radiusMiles: number,
  facilities: Facility[],
  permits: Permit[],
  violations: Violation[],
): Array<{
  facility: Facility;
  distanceMiles: number;
  activePermits: number;
  recentViolations: number;
  complianceScore: number;
  riskLevel: string;
}> {
  return facilities
    .map(f => {
      const dist = haversineDistance(location.lat, location.lng, f.address.lat, f.address.lng);
      if (dist > radiusMiles) return null;

      const facilityPermits = permits.filter(p => p.facilityId === f.id && p.status === 'active');
      const facilityViolations = violations.filter(v => v.facilityId === f.id);
      const recentViolations = facilityViolations.filter(v => {
        const age = Date.now() - new Date(v.discoveredDate).getTime();
        return age < 365 * 24 * 60 * 60 * 1000 * 3; // Last 3 years
      });

      const complianceScore = calculateComplianceScore(facilityViolations);
      const riskLevel = complianceScore > 80 ? 'low' : complianceScore > 50 ? 'moderate' : complianceScore > 25 ? 'high' : 'critical';

      return {
        facility: f,
        distanceMiles: Math.round(dist * 10) / 10,
        activePermits: facilityPermits.length,
        recentViolations: recentViolations.length,
        complianceScore,
        riskLevel,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * Identify permits with upcoming public comment periods or hearings.
 * These are opportunities for community participation.
 */
export function findCommentOpportunities(
  permits: Permit[],
  daysAhead: number = 60,
): Array<{ permit: Permit; daysUntilDeadline: number; type: 'comment-period' | 'public-hearing' }> {
  const now = Date.now();
  const horizon = now + daysAhead * 24 * 60 * 60 * 1000;
  const opportunities: Array<{ permit: Permit; daysUntilDeadline: number; type: 'comment-period' | 'public-hearing' }> = [];

  for (const permit of permits) {
    if (permit.publicCommentDeadline) {
      const deadline = new Date(permit.publicCommentDeadline).getTime();
      if (deadline > now && deadline < horizon) {
        opportunities.push({
          permit,
          daysUntilDeadline: Math.ceil((deadline - now) / (24 * 60 * 60 * 1000)),
          type: 'comment-period',
        });
      }
    }
    if (permit.publicHearingDate) {
      const hearing = new Date(permit.publicHearingDate).getTime();
      if (hearing > now && hearing < horizon) {
        opportunities.push({
          permit,
          daysUntilDeadline: Math.ceil((hearing - now) / (24 * 60 * 60 * 1000)),
          type: 'public-hearing',
        });
      }
    }
  }

  return opportunities.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);
}

/**
 * Generate a public comment draft for a permit review.
 * Provides structured talking points based on facility history and community impact.
 */
export function generateCommentDraft(
  permit: Permit,
  facility: Facility,
  violations: Violation[],
  communityData: { name: string; population: number; percentMinority: number; percentBelowPoverty: number; asthmaRate: number },
): CommunityComment {
  const facilityViolations = violations.filter(v => v.facilityId === facility.id);
  const concerns: string[] = [];
  const requestedActions: string[] = [];
  const evidence: string[] = [];

  // Generate concerns based on data
  if (facilityViolations.length > 0) {
    concerns.push(`${facility.name} has ${facilityViolations.length} documented violations, demonstrating a pattern of non-compliance`);
    evidence.push(`Violation history: ${facilityViolations.length} total violations, ${facilityViolations.filter(v => v.severity === 'high-priority').length} high-priority`);
  }

  if (communityData.percentMinority > 50 || communityData.percentBelowPoverty > 20) {
    concerns.push(`This facility is located in an environmental justice community (${communityData.percentMinority}% minority, ${communityData.percentBelowPoverty}% below poverty line)`);
    requestedActions.push('Conduct a cumulative impact analysis as part of the permit review');
  }

  if (communityData.asthmaRate > 10) {
    concerns.push(`The surrounding community has an elevated asthma rate of ${communityData.asthmaRate}%, which may be exacerbated by emissions from this facility`);
    requestedActions.push('Require continuous emissions monitoring and real-time public reporting');
  }

  requestedActions.push('Hold a public hearing in the affected community during accessible hours');
  requestedActions.push('Require enhanced monitoring and reporting conditions');
  requestedActions.push('Conduct a health impact assessment before permit issuance');

  return CommunityCommentSchema.parse({
    id: crypto.randomUUID(),
    permitId: permit.id,
    authorName: '',
    submittedDate: new Date().toISOString(),
    concerns,
    requestedActions,
    supportingEvidence: evidence,
    status: 'draft',
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateComplianceScore(violations: Violation[]): number {
  if (violations.length === 0) return 100;
  let score = 100;
  for (const v of violations) {
    const age = (Date.now() - new Date(v.discoveredDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
    const recencyFactor = Math.max(0.2, 1 - age / 5); // Recent violations weigh more
    const severityPenalty = v.severity === 'high-priority' ? 15 : v.severity === 'significant' ? 8 : 3;
    score -= severityPenalty * recencyFactor;
  }
  return Math.max(0, Math.round(score));
}
