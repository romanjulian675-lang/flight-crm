export const CAMPAIGN_CHANNELS = ["instagram", "facebook", "youtube", "google"] as const;
export type CampaignChannel = typeof CAMPAIGN_CHANNELS[number];

/** Only attribution fields enter the generated public inquiry link. */
export function campaignLink(base: string, locale: string, channel: CampaignChannel, campaign: string, content: string) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("lang", locale === "es" ? "es" : "en");
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", channel === "google" ? "cpc" : "social");
  if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim().slice(0, 120));
  if (content.trim()) url.searchParams.set("utm_content", content.trim().slice(0, 120));
  return url.toString();
}
