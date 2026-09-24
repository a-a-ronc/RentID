import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { rpc: (...args: unknown[]) => rpc(...args) },
  DbError: class extends Error {},
  logAudit: vi.fn(),
  nowIso: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
  unwrap: vi.fn(),
  unwrapMaybe: vi.fn(),
  unwrapOne: vi.fn(),
}));
vi.mock("@/lib/services/operations", () => ({
  notifyOrganizationOwner: vi.fn(),
  notifyUser: vi.fn(),
}));

const { ensureMyRentPeriods, ensureRentPeriods, resetRentPeriodThrottle } =
  await import("./finance");

describe("rent period generation (client side)", () => {
  beforeEach(() => {
    rpc.mockReset();
    resetRentPeriodThrottle();
  });

  it("calls the org generator and returns how many periods it created", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(ensureRentPeriods("org-1")).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("ensure_rent_periods", { _org_id: "org-1" });
  });

  it("shares one in-flight call between concurrent ledger queries", async () => {
    let resolve!: (v: { data: number; error: null }) => void;
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = ensureRentPeriods("org-1");
    const b = ensureRentPeriods("org-1");
    resolve({ data: 2, error: null });
    await expect(Promise.all([a, b])).resolves.toEqual([2, 2]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not call again within the throttle window, but does for another org", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    await ensureRentPeriods("org-1");
    await ensureRentPeriods("org-1");
    await ensureRentPeriods("org-2");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("never throws: an RPC error or rejection reads as zero", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(ensureRentPeriods("org-1")).resolves.toBe(0);
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(ensureMyRentPeriods("user-1")).resolves.toBe(0);
  });

  it("skips entirely without an org or user", async () => {
    await expect(ensureRentPeriods(null)).resolves.toBe(0);
    await expect(ensureMyRentPeriods(null)).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the tenant generator for the signed-in tenant", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await expect(ensureMyRentPeriods("user-1")).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledWith("ensure_my_rent_periods");
  });
});
