import { describe, expect, it } from "vitest";

import { applicationBucket, incomeCheck, isUndecided, sortForInbox } from "./applications";
import type { ApplicationStatus } from "./types";

describe("applicationBucket", () => {
  it.each<[ApplicationStatus, string]>([
    ["new", "decide"],
    ["submitted", "decide"],
    ["in_review", "decide"],
    ["more_info_requested", "decide"],
    ["qualified", "decide"],
    ["approved", "approved"],
    ["lease_sent", "approved"],
    ["lease_signed", "approved"],
    ["denied", "closed"],
    ["withdrawn", "closed"],
  ])("%s → %s", (status, bucket) => {
    expect(applicationBucket(status)).toBe(bucket);
  });

  it("only undecided applications can be approved or denied from the inbox", () => {
    expect(isUndecided("submitted")).toBe(true);
    expect(isUndecided("approved")).toBe(false);
    expect(isUndecided("denied")).toBe(false);
  });
});

describe("incomeCheck", () => {
  it("meets the 3× rule", () => {
    expect(incomeCheck(4500, 1500)).toEqual({ ratio: 3, tone: "success", label: "3× rent" });
  });
  it("is close", () => {
    expect(incomeCheck(4000, 1500)?.tone).toBe("warning");
    expect(incomeCheck(4000, 1500)?.ratio).toBe(2.7);
  });
  it("falls short", () => {
    expect(incomeCheck(3000, 1500)?.tone).toBe("danger");
  });
  it("says nothing without both numbers", () => {
    expect(incomeCheck(null, 1500)).toBeNull();
    expect(incomeCheck(4000, 0)).toBeNull();
    expect(incomeCheck(-1, 1500)).toBeNull();
  });
});

describe("sortForInbox", () => {
  it("puts ones waiting on the applicant after ones waiting on the landlord, newest first", () => {
    const rows = sortForInbox([
      { id: "a", status: "more_info_requested" as ApplicationStatus, created_at: "2026-09-20" },
      { id: "b", status: "submitted" as ApplicationStatus, created_at: "2026-09-10" },
      { id: "c", status: "submitted" as ApplicationStatus, created_at: "2026-09-22" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
