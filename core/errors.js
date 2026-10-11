/**
 * UNIVERSAL CORE — Business Edition
 * Typed errors. Every denial is explicit and auditable; nothing fails open.
 */
export class CoreError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
  toJSON() {
    return { error: this.code, message: this.message, details: this.details };
  }
}

export const deny = (code, message, details) => new CoreError(code, message, 403, details);
export const notFound = (what, id) => new CoreError("NOT_FOUND", `${what} not found`, 404, { id });
export const invalid = (message, details) => new CoreError("VALIDATION_ERROR", message, 422, details);
export const unauthenticated = (message = "Authentication required") => new CoreError("UNAUTHENTICATED", message, 401);
