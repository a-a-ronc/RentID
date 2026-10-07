import { describe, expect, it } from "vitest";

import {
  friendlyAuthError,
  hasErrors,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirmation,
} from "./auth-validation";

describe("validateEmail", () => {
  it("requires a value", () => expect(validateEmail("  ")).toMatch(/enter your email/i));
  it.each(["aaron", "aaron@", "aaron@rentid", "a a@rentid.online", "@rentid.online"])(
    "rejects %s",
    (v) => expect(validateEmail(v)).toMatch(/valid email/i),
  );
  it.each(["aaron@rentid.online", " Aaron.C+test@sub.example.co "])("accepts %s", (v) =>
    expect(validateEmail(v)).toBeNull(),
  );
});

describe("validateFullName", () => {
  it("requires first and last", () => {
    expect(validateFullName("")).toMatch(/full name/i);
    expect(validateFullName("Aaron")).toMatch(/first and last/i);
    expect(validateFullName("Aaron Cendejas")).toBeNull();
  });
});

describe("validatePassword", () => {
  it("only needs presence to sign in", () => {
    expect(validatePassword("", "signin")).toMatch(/enter your password/i);
    expect(validatePassword("short", "signin")).toBeNull();
  });
  it("enforces length for a new password and says how far off it is", () => {
    expect(validatePassword("short", "new")).toBe("Use at least 12 characters (you have 5).");
    expect(validatePassword("a long enough passphrase", "new")).toBeNull();
  });
  it("rejects all-space passwords", () => {
    expect(validatePassword(" ".repeat(14), "new")).toMatch(/only spaces/);
  });
});

describe("validatePasswordConfirmation", () => {
  it("requires a match", () => {
    expect(validatePasswordConfirmation("abc", "")).toMatch(/re-enter/i);
    expect(validatePasswordConfirmation("abc", "abd")).toMatch(/don't match/);
    expect(validatePasswordConfirmation("abc", "abc")).toBeNull();
  });
});

describe("hasErrors", () => {
  it("ignores empty entries", () => {
    expect(hasErrors({ email: undefined, password: "" })).toBe(false);
    expect(hasErrors({ email: "bad" })).toBe(true);
  });
});

describe("friendlyAuthError", () => {
  it("never says which credential was wrong", () => {
    const msg = friendlyAuthError(new Error("Invalid login credentials"));
    expect(msg).toBe("Incorrect email or password. Check both and try again.");
  });
  it.each([
    ["User already registered", /already exists/],
    ["Email not confirmed", /confirm your email/i],
    ["For security purposes, you can only request this after 42 seconds.", /too many attempts/i],
    ["email rate limit exceeded", /too many attempts/i],
    ["Password should be at least 6 characters.", /at least 12 characters/],
    ["Password is known to be weak and easy to guess", /too easy to guess/],
    ["New password should be different from the old password.", /haven't used before/],
    ["Auth session missing!", /expired or was already used/],
    ["Email link is invalid or has expired", /expired or was already used/],
    ["Failed to fetch", /couldn't reach/],
    ["TypeError: Load failed", /couldn't reach/],
  ])("%s", (raw, expected) => expect(friendlyAuthError(new Error(raw))).toMatch(expected));

  it("passes unknown messages through instead of hiding them", () => {
    expect(friendlyAuthError(new Error("Something specific"))).toBe("Something specific");
    expect(friendlyAuthError(42)).toBe("Something went wrong.");
  });
});
