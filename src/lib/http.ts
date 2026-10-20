/** Helpers for public, unauthenticated endpoints. */

export const MAX_BODY_BYTES = 64 * 1024;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers } });
}

/** Read a JSON, urlencoded or multipart body into a flat object. Returns null when too big or unreadable. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return null;
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const fd = await req.formData();
      const out: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = out[k] ? `${out[k]}, ${v}` : v;
      return out;
    }
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const parsed = JSON.parse(text || "{}");
    if (Array.isArray(parsed)) return parsed[0] && typeof parsed[0] === "object" ? parsed[0] : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

/** Only absolute http(s) URLs are allowed as post-submit redirects. */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
