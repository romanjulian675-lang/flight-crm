import { describe, expect, it } from "vitest";
import { CAMPAIGN_CHANNELS, campaignLink } from "../../src/lib/campaign-links";

describe("tracked inquiry links", () => {
  it("produces a separate attributed destination for every supported channel", () => {
    for (const channel of CAMPAIGN_CHANNELS) {
      const url = new URL(campaignLink("https://crm.example.com/embed/public-token", "es", channel, "ground school", "video-123"));
      expect(url.pathname).toBe("/embed/public-token");
      expect(Object.fromEntries(url.searchParams)).toEqual({ lang: "es", utm_source: channel, utm_medium: channel === "google" ? "cpc" : "social", utm_campaign: "ground school", utm_content: "video-123" });
    }
  });

  it("encodes user input as values and discards unrelated parameters", () => {
    const url = new URL(campaignLink("https://crm.example.com/embed/t?source=facebook&_redirect=bad#fragment", "xx", "youtube", "  Inglés & PPL?source=other  ", ""));
    expect(url.searchParams.get("utm_campaign")).toBe("Inglés & PPL?source=other");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.has("source")).toBe(false);
    expect(url.searchParams.has("_redirect")).toBe(false);
    expect(url.searchParams.has("utm_content")).toBe(false);
    expect(url.hash).toBe("");
  });

  it("limits campaign metadata to what intake can preserve", () => {
    const url = new URL(campaignLink("https://crm.example.com/embed/t", "en", "instagram", "a".repeat(200), "b".repeat(200)));
    expect(url.searchParams.get("utm_campaign")).toHaveLength(120);
    expect(url.searchParams.get("utm_content")).toHaveLength(120);
  });
});
