/** Display helpers shared by server and client components. Everything renders in the school's zone. */

export function formatPhone(digits: string | null | undefined) {
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `+${digits}`;
}

export function formatDate(d: Date | string, locale: string, tz: string, withTime = false) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(d));
}

/** "3h", "2d" style age. */
export function shortAge(from: Date | string, now = new Date()) {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function daysSince(from: Date | string, now = new Date()) {
  return Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000);
}

export const fullName = (l: { firstName: string; lastName: string }) => `${l.firstName} ${l.lastName}`.trim();
