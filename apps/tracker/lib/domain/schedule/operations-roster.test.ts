import { describe, expect, it, vi } from "vitest";

// REQ-58 AC9: the roster's teaching filter is isActiveTeachingStaff itself, not a re-reading of `active`.
vi.mock("../staff", async (original) => {
  const real = await original<typeof import("../staff")>();
  return { ...real, isActiveTeachingStaff: vi.fn(real.isActiveTeachingStaff) };
});

describe("teacherRoster guard", () => {
  it("calls isActiveTeachingStaff for each snapshot row", async () => {
    const staff = await import("../staff");
    const { teacherRoster } = await import("./operations");
    const rows = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", active: true }, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002", active: false }];
    teacherRoster({ staff: rows, occurrences: [], availability: [], range: { from: "2026-10-01", to: "2026-10-31" } });
    expect(vi.mocked(staff.isActiveTeachingStaff)).toHaveBeenCalledWith({ status: "Active", functions: ["Teacher"] });
    expect(vi.mocked(staff.isActiveTeachingStaff)).toHaveBeenCalledWith({ status: "Inactive", functions: [] });
  });
});
