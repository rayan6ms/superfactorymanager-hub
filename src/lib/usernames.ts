export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/;
export const USERNAME_HELP_TEXT = "Use 3-32 characters with letters, numbers, hyphens, or underscores. Usernames are stored in lowercase.";

export type UsernameValidationCode =
  | "NAME_REQUIRED"
  | "NAME_TOO_SHORT"
  | "NAME_TOO_LONG"
  | "NAME_INVALID";

export type UsernameValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; code: UsernameValidationCode };

export function validateUsernameInput(raw: string): UsernameValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "NAME_REQUIRED" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: "NAME_REQUIRED" };
  }

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return { ok: false, code: "NAME_TOO_SHORT" };
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return { ok: false, code: "NAME_TOO_LONG" };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    return { ok: false, code: "NAME_INVALID" };
  }

  return { ok: true, normalized: trimmed.toLowerCase() };
}
