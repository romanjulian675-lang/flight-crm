import { describe, expect, it, vi } from "vitest";
import { createPathwayPartner, createPathwayReferral, partnerInput, profileInput, referralStatuses, updatePathwayReferral, upsertPathwayProfile } from "@/modules/pathway-exchange";
import type { AccessContext } from "@/modules/access";

const ctx = { orgId: "org-1", membershipId: "member-1", role: "OWNER", agentsSeeAll: true } as AccessContext;

describe("pathway exchange validation", () => {
  it("accepts a partner catalog entry with optional contact data", () => {
    const result = partnerInput.parse({
      name: "Embry-Riddle pathway",
      country: "United States",
      type: "UNIVERSITY",
      website: "https://example.edu",
      contactEmail: null,
      notes: null,
    });
    expect(result.type).toBe("UNIVERSITY");
  });

  it("rejects negative flight hours", () => {
    expect(() => profileInput.parse({ targetCountry: "Canada", targetProgram: null, currentHours: -1, currentLicense: null, englishLevel: null })).toThrow();
  });

  it("keeps referral status transitions explicit", () => {
    expect(referralStatuses).toEqual(["DRAFT", "CONSENT_PENDING", "SENT", "ACCEPTED", "DECLINED", "CONVERTED"]);
  });

  it("creates a partner inside the caller organization", async () => {
    const create = vi.fn().mockResolvedValue({ id: "partner-1" });
    await createPathwayPartner({ pathwayPartner: { create } } as never, ctx, { name: "Global Aviation", country: "Canada", type: "FLIGHT_SCHOOL", website: null, contactEmail: null, notes: null });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orgId: "org-1", name: "Global Aviation" }) }));
  });

  it("upserts the lead pathway passport", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "profile-1" });
    const db = { lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) }, pathwayProfile: { upsert } };
    await upsertPathwayProfile(db as never, ctx, "lead-1", { targetCountry: "Canada", targetProgram: "Commercial", currentHours: 42, currentLicense: "PPL", englishLevel: "B2" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { leadId: "lead-1" }, create: expect.objectContaining({ orgId: "org-1", currentHours: 42 }) }));
  });

  it("creates a referral and records the handoff in the lead timeline", async () => {
    const create = vi.fn().mockResolvedValue({ id: "ref-1" });
    const activity = vi.fn().mockResolvedValue({});
    const db = { lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) }, pathwayPartner: { findFirst: vi.fn().mockResolvedValue({ id: "partner-1", name: "Global Aviation" }) }, pathwayReferral: { create }, activity: { create: activity } };
    await createPathwayReferral(db as never, ctx, { leadId: "lead-1", partnerId: "partner-1", status: "SENT", note: "Student consented" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT", sentAt: expect.any(Date) }) }));
    expect(activity).toHaveBeenCalledOnce();
  });

  it("updates a referral outcome and records the status change", async () => {
    const update = vi.fn().mockResolvedValue({ id: "ref-1" });
    const activity = vi.fn().mockResolvedValue({});
    const db = { pathwayReferral: { findFirst: vi.fn().mockResolvedValue({ id: "ref-1", leadId: "lead-1", partner: { name: "Global Aviation" } }), update }, activity: { create: activity } };
    await updatePathwayReferral(db as never, ctx, "ref-1", "CONVERTED", "Accepted by partner");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ref-1" }, data: expect.objectContaining({ status: "CONVERTED", outcome: "Accepted by partner" }) }));
    expect(activity).toHaveBeenCalledOnce();
  });
});
