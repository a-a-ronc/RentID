import { describe, expect, it } from "vitest";

import { homePathFor, safeNextPath } from "./auth-routing";

describe("homePathFor", () => {
  it("routes by role", () => {
    expect(homePathFor(["landlord"])).toBe("/dashboard");
    expect(homePathFor(["tenant"])).toBe("/tenant");
    expect(homePathFor(["property_manager"])).toBe("/manager");
    expect(homePathFor(["admin"])).toBe("/admin/prospects");
    expect(homePathFor(["tenant", "landlord"])).toBe("/dashboard");
    expect(homePathFor([])).toBe("/dashboard");
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/payments?tab=due")).toBe("/payments?tab=due");
    expect(safeNextPath("https://rentid.online/reports", "https://rentid.online")).toBe("/reports");
  });
  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/auth?next=/x",
    "/reset-password",
    "",
    42,
  ])("rejects %s", (v) => expect(safeNextPath(v, "https://rentid.online")).toBeNull());
});
