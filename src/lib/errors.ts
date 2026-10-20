/** Errors with a safe, user-facing message. Never put secrets or raw provider payloads in them. */
export class AppError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "NOT_IMPLEMENTED" | "PROVIDER",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  get httpStatus(): number {
    return {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION: 400,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      NOT_IMPLEMENTED: 501,
      PROVIDER: 502,
    }[this.code];
  }
}

export const forbidden = (msg = "You do not have access to this.") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "Not found.") => new AppError("NOT_FOUND", msg);
export const invalid = (msg: string) => new AppError("VALIDATION", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);

export function userMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Something went wrong. Nothing was changed.";
}
