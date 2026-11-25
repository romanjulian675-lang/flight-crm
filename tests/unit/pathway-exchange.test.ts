import { describe, expect, it } from "vitest";
import { partnerInput, profileInput, referralStatuses } from "@/modules/pathway-exchange";

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
});
