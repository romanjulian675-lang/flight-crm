import { describe, expect, it } from "vitest";
import { pathwayReadiness } from "@/modules/pathways";

describe("pathwayReadiness", () => {
  it("prioritizes the missing medical step for a new international lead", () => {
    expect(pathwayReadiness({ medical: "UNKNOWN", funding: "UNKNOWN", timeline: null, language: "en" })).toEqual({
      score: 0,
      missing: ["MEDICAL", "FUNDING", "TIMELINE"],
      nextAction: "MEDICAL",
      language: "en",
    });
  });

  it("marks a lead ready for an advisor when the basic information is complete", () => {
    expect(pathwayReadiness({ medical: "HAS_MEDICAL", funding: "LOAN", timeline: "next month", language: "es" })).toEqual({
      score: 100,
      missing: [],
      nextAction: "ADVISOR",
      language: "es",
    });
  });
});
