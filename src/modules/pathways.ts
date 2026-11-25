import type { Funding, MedicalStatus } from "@/generated/prisma/client";

export type PathwayLead = {
  medical: MedicalStatus;
  funding: Funding;
  timeline: string | null;
  language: string;
};

export type PathwayAction = "MEDICAL" | "FUNDING" | "TIMELINE" | "ADVISOR";

/**
 * Turns existing international-lead fields into a small, explainable readiness signal.
 * This is intentionally advisory: it does not claim visa, licence or credit eligibility.
 */
export function pathwayReadiness(lead: PathwayLead) {
  const missing: PathwayAction[] = [];
  if (lead.medical === "UNKNOWN") missing.push("MEDICAL");
  if (lead.funding === "UNKNOWN") missing.push("FUNDING");
  if (!lead.timeline?.trim()) missing.push("TIMELINE");

  return {
    score: Math.round(((3 - missing.length) / 3) * 100),
    missing,
    nextAction: missing[0] ?? "ADVISOR",
    language: lead.language === "es" ? "es" : "en",
  };
}
