import { describe, expect, it } from "vitest";

import { collectionsByMonth, lastMonths, occupancy, rentRoll, toCsv } from "./reports";
import type { PaymentStatus, PropertyWithUnits, TenancyDetail } from "./types";

const pay = (due_date: string, amount: number, status: PaymentStatus) => ({
  due_date,
  amount,
  status,
});

describe("lastMonths", () => {
  it("counts back across a year boundary, oldest first", () => {
    expect(lastMonths("2026-02-14", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("collectionsByMonth", () => {
  const rows = collectionsByMonth(
    [
      pay("2026-09-01", 1500, "paid"),
      pay("2026-09-03", 1200, "late"),
      pay("2026-08-01", 1500, "paid"),
      pay("2026-08-01", 1200, "paid"),
      pay("2026-08-05", 900, "refunded"),
      pay("2025-01-01", 999, "paid"), // outside the window
    ],
    "2026-09-24",
    3,
  );

  it("returns one row per month in the window", () => {
    expect(rows.map((r) => r.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("sums expected, collected, outstanding and late", () => {
    const sep = rows[2]!;
    expect(sep).toMatchObject({ expected: 2700, collected: 1500, outstanding: 1200, late: 1 });
    expect(sep.rate).toBe(56);
  });

  it("ignores refunded rows and reports 100% for a fully paid month", () => {
    expect(rows[1]).toMatchObject({ expected: 2700, collected: 2700, rate: 100 });
  });

  it("has no rate when nothing was due", () => {
    expect(rows[0]!.rate).toBeNull();
  });
});

describe("rentRoll", () => {
  const tenancy = (over: Partial<TenancyDetail>): TenancyDetail =>
    ({
      id: "t1",
      status: "active",
      tenant_name: "Ana",
      monthly_rent: 1500,
      verified: true,
      start_date: "2026-01-01",
      end_date: null,
      property: { name: "Elm" },
      unit: { name: "2", monthly_rent: 1400 },
      payments: [],
      ...over,
    }) as unknown as TenancyDetail;

  it("keeps only active tenancies and totals unpaid rent due before today", () => {
    const roll = rentRoll(
      [
        tenancy({
          payments: [
            { status: "late", due_date: "2026-08-01", amount: 1500 },
            { status: "scheduled", due_date: "2026-09-01", amount: 1500 },
            { status: "scheduled", due_date: "2026-10-01", amount: 1500 }, // future
            { status: "pending", due_date: "2026-07-01", amount: 1500 }, // awaiting confirmation
            {
              status: "paid",
              due_date: "2026-06-01",
              amount: 1500,
              paid_at: "2026-06-02T10:00:00Z",
            },
          ] as TenancyDetail["payments"],
        }),
        tenancy({ id: "t2", status: "ended", tenant_name: "Old" }),
      ],
      "2026-09-24",
    );
    expect(roll).toHaveLength(1);
    expect(roll[0]).toMatchObject({ pastDue: 3000, lastPaid: "2026-06-02", rent: 1500 });
  });

  it("falls back to the unit's rent", () => {
    expect(rentRoll([tenancy({ monthly_rent: null })], "2026-09-24")[0]!.rent).toBe(1400);
  });
});

describe("occupancy", () => {
  it("counts occupied units and splits rent", () => {
    const o = occupancy([
      {
        units: [
          { occupancy_status: "occupied", monthly_rent: 1500 },
          { occupancy_status: "vacant", monthly_rent: 1200 },
        ],
      },
    ] as unknown as PropertyWithUnits[]);
    expect(o).toEqual({ units: 2, occupied: 1, rate: 50, scheduledRent: 1500, vacantRent: 1200 });
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv([{ a: 'He said "hi", then\nleft' }], [{ header: "A", value: (r) => r.a }]);
    expect(csv).toBe('A\r\n"He said ""hi"", then\nleft"\r\n');
  });

  it("neutralises spreadsheet formulas but not negative numbers", () => {
    const csv = toCsv(
      [{ a: '=HYPERLINK("http://x")' }, { a: "-12.5" }, { a: "@SUM(A1)" }],
      [{ header: "A", value: (r) => r.a }],
    );
    expect(csv.split("\r\n")).toEqual([
      "A",
      `"'=HYPERLINK(""http://x"")"`,
      "-12.5",
      "'@SUM(A1)",
      "",
    ]);
  });
});
