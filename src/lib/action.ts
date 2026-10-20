import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { getI18n, type Dict } from "@/lib/i18n";
import { requireAccess } from "@/lib/session";
import type { AccessContext } from "@/modules/access";

export type ActionResult<T = undefined> = { ok: boolean; message: string; at: number; data?: T } | null;

/** Turn a service error into a message in the user's language. Unknown errors are never shown raw. */
export function translateError(err: unknown, t: Dict): string {
  const errors = t.errors as Record<string, string>;
  if (err instanceof ZodError) return [...new Set(err.issues.map((i) => errors[i.message] ?? t.common.unexpected))].join(" ");
  if (err instanceof AppError) return errors[err.message] ?? errors[err.code] ?? err.message;
  console.error("[action] unexpected error:", err instanceof Error ? err.message : err);
  return t.common.unexpected;
}

/**
 * Wrap a server action: resolve the caller, run the service, refresh the UI, and turn failures into
 * a safe, translated message. Next.js already rejects cross-origin action posts.
 */
export async function runAction<T = undefined>(
  fn: (ctx: AccessContext) => Promise<string | void | { message?: string; data?: T }>,
): Promise<ActionResult<T>> {
  const { t } = await getI18n();
  try {
    const ctx = await requireAccess();
    const res = await fn(ctx);
    revalidatePath("/", "layout");
    const message = typeof res === "string" ? res : (res?.message ?? t.common.saved);
    return { ok: true, message, at: Date.now(), data: typeof res === "object" && res ? res.data : undefined };
  } catch (err) {
    return { ok: false, message: translateError(err, t), at: Date.now() };
  }
}

export const formString = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
export const formOptional = (fd: FormData, key: string) => formString(fd, key) || null;
export const formBool = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true";
