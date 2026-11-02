import { createHash } from "node:crypto";
import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { zonedToUtc } from "@/lib/dates";
import { AppError, invalid } from "@/lib/errors";
import type { CalendarConnection } from "@/generated/prisma/client";
import type { AccessContext } from "@/modules/access";

/**
 * Google Calendar, per team member: free/busy lookups for the booking page and creating the call
 * event (with a Google Meet link) on the host's primary calendar. Plain REST calls, no SDK.
 *
 * Setup (once per Google Workspace): an OAuth client of type "Web application" with redirect URI
 * APP_URL/api/integrations/google/callback, the Google Calendar API enabled, and GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET on the server. Each member then clicks "Connect Google Calendar" in Settings;
 * we keep their refresh token (encrypted) and exchange it for short-lived access tokens.
 */

export type Fetch = typeof fetch;

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const CALENDAR_SCOPES = GOOGLE_SCOPES.filter((s) => s.startsWith("https://"));

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/** Short-lived cookie tying the OAuth round-trip to the member that started it. */
export const GOOGLE_STATE_COOKIE = "fl_gcal_state";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3200";
  return { configured: Boolean(clientId && clientSecret), clientId, clientSecret, appUrl, fake: fakeCalendarEnabled() };
}

/**
 * Test/preview only: CALENDAR_FAKE=1 swaps Google for an in-memory calendar (no network) so the
 * booking flow can be tried locally. Never active in production builds.
 */
export function fakeCalendarEnabled() {
  return process.env.CALENDAR_FAKE === "1" && process.env.NODE_ENV !== "production";
}

export const googleRedirectUri = () => `${googleConfig().appUrl}/api/integrations/google/callback`;

export function googleAuthUrl(state: string, loginHint?: string) {
  const c = googleConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(f: Fetch, params: Record<string, string>) {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  return { ok: res.ok && !json.error, status: res.status, json };
}

/** Email from the id_token we just received from Google's token endpoint over TLS (no signature check needed, per OIDC). */
function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return claims.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** OAuth callback: exchange the code and store (or replace) the member's calendar connection. */
export async function connectGoogleCalendar(db: Db, ctx: AccessContext, code: string, f: Fetch = fetch, now = new Date()) {
  const c = googleConfig();
  const { ok, json } = await tokenRequest(f, { code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" });
  if (!ok || !json.access_token) throw new AppError("PROVIDER", `Google: ${json.error_description ?? json.error ?? "token exchange failed"}`);
  const granted = (json.scope ?? "").split(" ");
  if (!CALENDAR_SCOPES.every((s) => granted.includes(s))) throw invalid("calendarScopesMissing");
  const email = emailFromIdToken(json.id_token);
  if (!email) throw new AppError("PROVIDER", "Google: no email in the response");

  const existing = await db.calendarConnection.findUnique({ where: { membershipId: ctx.membershipId } });
  // Google only sends a refresh token on consent; prompt=consent makes that every time, but keep the old one just in case.
  const refreshTokenEnc = json.refresh_token ? encryptSecret(json.refresh_token) : existing?.refreshTokenEnc;
  if (!refreshTokenEnc) throw new AppError("PROVIDER", "Google: no refresh token (remove the app's access in your Google account and connect again)");
  const fields = {
    email,
    refreshTokenEnc,
    accessTokenEnc: encryptSecret(json.access_token),
    accessTokenExpiresAt: new Date(now.getTime() + (json.expires_in ?? 3600) * 1000),
    scope: json.scope ?? null,
    status: "ACTIVE" as const,
    lastError: null,
  };
  return db.calendarConnection.upsert({
    where: { membershipId: ctx.membershipId },
    create: { ...fields, orgId: ctx.orgId, membershipId: ctx.membershipId },
    update: fields,
  });
}

/** Preview mode (CALENDAR_FAKE=1): connect without Google. */
export async function connectFakeCalendar(db: Db, ctx: AccessContext) {
  if (!fakeCalendarEnabled()) throw invalid("calendarNotConfigured");
  const fields = { email: ctx.email, refreshTokenEnc: encryptSecret("fake"), status: "ACTIVE" as const, lastError: null, scope: CALENDAR_SCOPES.join(" ") };
  return db.calendarConnection.upsert({ where: { membershipId: ctx.membershipId }, create: { ...fields, orgId: ctx.orgId, membershipId: ctx.membershipId }, update: fields });
}

/** Revoke at Google (best effort) and forget the tokens. Only your own calendar. */
export async function disconnectCalendar(db: Db, ctx: AccessContext, f: Fetch = fetch) {
  const conn = await db.calendarConnection.findFirst({ where: { membershipId: ctx.membershipId, orgId: ctx.orgId } });
  if (!conn) return;
  if (!fakeCalendarEnabled()) {
    try {
      await f(`${REVOKE_URL}?${new URLSearchParams({ token: decryptSecret(conn.refreshTokenEnc) })}`, { method: "POST" });
    } catch {
      // Already revoked or unreachable: deleting our copy is what matters.
    }
  }
  await db.calendarConnection.delete({ where: { id: conn.id } });
}

export function listCalendars(db: Db, orgId: string) {
  return db.calendarConnection.findMany({ where: { orgId }, select: { membershipId: true, email: true, status: true, lastError: true } });
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/** The host's calendar can't be used right now (broken connection or Google unreachable). */
export class CalendarUnavailableError extends AppError {
  constructor(
    public readonly broken: boolean,
    detail: string,
  ) {
    super("PROVIDER", detail);
  }
}

/**
 * A valid access token, refreshed when it expires within a minute. A rejected refresh token marks the
 * connection BROKEN (the member must reconnect); network/5xx failures don't.
 */
export async function accessToken(db: Db, conn: CalendarConnection, f: Fetch = fetch, now = new Date()): Promise<string> {
  if (conn.status === "BROKEN") throw new CalendarUnavailableError(true, conn.lastError ?? "Calendar disconnected");
  if (conn.accessTokenEnc && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - 60_000 > now.getTime()) {
    return decryptSecret(conn.accessTokenEnc);
  }
  const c = googleConfig();
  let res: Awaited<ReturnType<typeof tokenRequest>>;
  try {
    res = await tokenRequest(f, { client_id: c.clientId, client_secret: c.clientSecret, refresh_token: decryptSecret(conn.refreshTokenEnc), grant_type: "refresh_token" });
  } catch (e) {
    throw new CalendarUnavailableError(false, `Google unreachable: ${e instanceof Error ? e.message : e}`);
  }
  if (!res.ok || !res.json.access_token) {
    const detail = `Google token refresh failed: ${res.json.error_description ?? res.json.error ?? `HTTP ${res.status}`}`.slice(0, 300);
    if (res.status >= 400 && res.status < 500) {
      await db.calendarConnection.update({ where: { id: conn.id }, data: { status: "BROKEN", lastError: detail, accessTokenEnc: null, accessTokenExpiresAt: null } });
      conn.status = "BROKEN";
      throw new CalendarUnavailableError(true, detail);
    }
    throw new CalendarUnavailableError(false, detail);
  }
  const expiresAt = new Date(now.getTime() + (res.json.expires_in ?? 3600) * 1000);
  await db.calendarConnection.update({ where: { id: conn.id }, data: { accessTokenEnc: encryptSecret(res.json.access_token), accessTokenExpiresAt: expiresAt } });
  conn.accessTokenEnc = encryptSecret(res.json.access_token);
  conn.accessTokenExpiresAt = expiresAt;
  return res.json.access_token;
}

// ---------------------------------------------------------------------------
// Calendar provider (Google, or the fake one for previews/tests)
// ---------------------------------------------------------------------------

export type Interval = { start: Date; end: Date };

export type NewEvent = {
  /** Idempotency key for the Meet link request (our booking id). */
  requestId: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
  attendee: { email: string; name: string };
  /** false for phone calls: no Meet link is created. Default true. */
  meet?: boolean;
  /** Shown as the event location, e.g. the number to ring. */
  location?: string;
};

export interface CalendarProvider {
  /** Busy intervals on the member's primary calendar between `from` and `to`. */
  freeBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]>;
  /** Create the event (with a Google Meet link unless `meet` is false) and email the attendee. */
  insertEvent(conn: CalendarConnection, event: NewEvent): Promise<{ id: string; meetLink: string | null }>;
  /** Delete the event and email the attendee. Missing events count as deleted. */
  deleteEvent(conn: CalendarConnection, eventId: string): Promise<void>;
}

async function gapi<T>(f: Fetch, token: string, method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<{ status: number; json: T }> {
  const qs = Object.keys(query).length ? `?${new URLSearchParams(query)}` : "";
  const res = await f(`${API}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok && !(method === "DELETE" && (res.status === 404 || res.status === 410))) {
    throw new AppError("PROVIDER", `Google Calendar: ${json.error?.message ?? `HTTP ${res.status}`}`.slice(0, 300));
  }
  return { status: res.status, json };
}

type GEvent = { id: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[]; createRequest?: { status?: { statusCode?: string } } } };
const meetLinkOf = (e: GEvent) => e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;

export function googleProvider(db: Db, f: Fetch = fetch, opts: { sleep?: (ms: number) => Promise<void> } = {}): CalendarProvider {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  return {
    async freeBusy(conn, from, to) {
      const token = await accessToken(db, conn, f);
      const { json } = await gapi<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }> }>(f, token, "POST", "/freeBusy", {}, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: "primary" }],
      });
      const cal = json.calendars?.primary ?? Object.values(json.calendars ?? {})[0];
      if (!cal || cal.errors?.length) throw new CalendarUnavailableError(false, `Google free/busy: ${cal?.errors?.[0]?.reason ?? "no data"}`);
      return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
    },

    async insertEvent(conn, ev) {
      const token = await accessToken(db, conn, f);
      const meet = ev.meet !== false;
      const { json } = await gapi<GEvent>(f, token, "POST", "/calendars/primary/events", { ...(meet ? { conferenceDataVersion: "1" } : {}), sendUpdates: "all" }, {
        summary: ev.summary,
        description: ev.description,
        ...(ev.location ? { location: ev.location } : {}),
        start: { dateTime: ev.start.toISOString(), timeZone: ev.timeZone },
        end: { dateTime: ev.end.toISOString(), timeZone: ev.timeZone },
        attendees: [{ email: ev.attendee.email, displayName: ev.attendee.name }],
        ...(meet ? { conferenceData: { createRequest: { requestId: ev.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
        reminders: { useDefault: true },
      });
      if (!meet) return { id: json.id, meetLink: null };
      let link = meetLinkOf(json);
      // Meet links are usually ready at once; if Google is still creating it, look once more.
      if (!link && json.conferenceData?.createRequest?.status?.statusCode === "pending") {
        await sleep(1500);
        const again = await gapi<GEvent>(f, token, "GET", `/calendars/primary/events/${encodeURIComponent(json.id)}`);
        link = meetLinkOf(again.json);
      }
      return { id: json.id, meetLink: link };
    },

    async deleteEvent(conn, eventId) {
      const token = await accessToken(db, conn, f);
      await gapi(f, token, "DELETE", `/calendars/primary/events/${encodeURIComponent(eventId)}`, { sendUpdates: "all" });
    },
  };
}

/**
 * In-memory stand-in for previews (CALENDAR_FAKE=1) and browser tests: every host is busy 12:00–13:00
 * New York time each day; events get a made-up Meet link. Nothing leaves the machine.
 */
export function fakeProvider(): CalendarProvider {
  return {
    async freeBusy(_conn, from, to) {
      const out: Interval[] = [];
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
      for (let t = from.getTime() - 86_400_000; t <= to.getTime() + 86_400_000; t += 86_400_000) {
        const day = fmt.format(new Date(t));
        out.push({ start: zonedToUtc(day, "12:00", "America/New_York"), end: zonedToUtc(day, "13:00", "America/New_York") });
      }
      return out;
    },
    async insertEvent(_conn, ev) {
      if (ev.meet === false) return { id: `fake-${ev.requestId}`, meetLink: null };
      const h = createHash("sha256").update(ev.requestId).digest("hex").replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
      return { id: `fake-${ev.requestId}`, meetLink: `https://meet.google.com/${h.slice(0, 3)}-${h.slice(3, 7)}-${h.slice(7, 10)}` };
    },
    async deleteEvent() {},
  };
}

/** The provider for this server: Google, unless the preview flag is on. */
export function calendarProvider(db: Db, f: Fetch = fetch): CalendarProvider {
  return fakeCalendarEnabled() ? fakeProvider() : googleProvider(db, f);
}
