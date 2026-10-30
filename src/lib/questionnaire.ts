import { z } from "zod";

export const trainingPaths = { LIFE_PROJECT: "Life Project — career pilot program", LICENSE: "An individual license or rating", EXPLORING: "I'm exploring my options" } as const;
export const trainingPrograms = { PRIVATE: "Private Pilot", INSTRUMENT: "Instrument Rating", COMMERCIAL: "Commercial Pilot", CFI: "Flight Instructor / CFII", OTHER: "Another license, conversion or not sure" } as const;
export const nextSteps = { MEETING: "Yes — book a meeting with a representative", DISCOVERY: "I'd like to arrange a discovery flight", EMAIL: "Send me the information by email" } as const;

const short = z.string().trim().max(120);
export const questionnaireInput = z.object({
  submissionId: z.uuid(),
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase().max(254), phone: z.string().trim().max(40).default(""),
  city: short.min(1), country: short.min(1),
  language: z.enum(["en", "es", "pt", "other"]),
  path: z.enum(["LIFE_PROJECT", "LICENSE", "EXPLORING"]),
  program: z.enum(["PRIVATE", "INSTRUMENT", "COMMERCIAL", "CFI", "OTHER"]).default("OTHER"),
  experience: z.string().trim().min(1).max(500),
  timeline: z.enum(["Within 1 month", "1–3 months", "3–6 months", "More than 6 months", "Not sure yet"]),
  nextStep: z.enum(["MEETING", "DISCOVERY", "EMAIL"]),
  questions: z.string().trim().max(1500).default(""),
  consent: z.literal(true),
  utm_source: short.optional(), utm_medium: short.optional(), utm_campaign: short.optional(), utm_content: short.optional(),
});
export type QuestionnaireInput = z.infer<typeof questionnaireInput>;

export const questionnaireConfig = z.object({
  enabled: z.boolean().default(false),
  meetingUrl: z.union([z.literal(""), z.url().refine(v => {
    const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && ["outlook.office.com", "outlook.office365.com", "book.ms", "outlook.cloud.microsoft", "bookings.cloud.microsoft"].includes(u.hostname);
  }, "Use the HTTPS Microsoft Bookings link for the academy calendar.")]).default(""),
  emailEnabled: z.boolean().default(false),
  replyTo: z.union([z.literal(""), z.email()]).default(""),
});
export type QuestionnaireConfig = z.infer<typeof questionnaireConfig>;
export function readQuestionnaireConfig(config: unknown): QuestionnaireConfig {
  const raw = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>).questionnaire : null;
  const parsed = questionnaireConfig.safeParse(raw);
  return parsed.success ? parsed.data : { enabled: false, meetingUrl: "", emailEnabled: false, replyTo: "" };
}
