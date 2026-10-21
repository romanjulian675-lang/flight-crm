/** Enum value lists safe to import from client components (no server code). Keep in sync with schema.prisma. */
export const SOURCE_VALUES = ["WEBSITE", "PHONE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE", "GOOGLE", "WHATSAPP", "WALK_IN", "REFERRAL", "OTHER"] as const;
export const PROGRAM_VALUES = ["DISCOVERY", "PRIVATE", "INSTRUMENT", "COMMERCIAL", "CFI", "CAREER", "OTHER"] as const;
export const MEDICAL_VALUES = ["UNKNOWN", "NONE", "SCHEDULED", "HAS_MEDICAL", "ISSUE"] as const;
export const FUNDING_VALUES = ["UNKNOWN", "SELF_PAY", "LOAN", "VA", "EMPLOYER", "OTHER"] as const;
export const CALL_OUTCOME_VALUES = ["CONNECTED", "VOICEMAIL", "NO_ANSWER", "WRONG_NUMBER"] as const;
