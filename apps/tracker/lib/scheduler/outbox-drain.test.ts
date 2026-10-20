import { describe, expect, it } from "vitest";
import type { SchedulerIdentity } from "./guard";
import { withBackgroundDrain } from "./outbox-drain";

const ORG = "10000000-0000-4000-8000-000000000001";
const staff = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ryan", email: null, functions: ["Teacher"], status: "Active", subjects: [] };

describe("withBackgroundDrain (AC9)", () => {
  it("schedules one drain for an admin, however many times the identity is resolved, and returns it unchanged", async () => {
    const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
    const scheduled: string[] = [];
    const identity = withBackgroundDrain(async () => admin, (org) => scheduled.push(org));
    expect(await identity()).toBe(admin);
    await identity();
    await identity();
    expect(scheduled).toEqual([ORG]);
  });
  it("never schedules for a teacher, none, signed out, unconfigured or unavailable", async () => {
    const others: SchedulerIdentity[] = [
      { scope: "teacher", orgId: ORG, staff },
      { scope: "none" },
      { scope: "signed_out" },
      { scope: "unconfigured" },
      { scope: "unavailable" },
    ] as SchedulerIdentity[];
    for (const who of others) {
      const scheduled: string[] = [];
      const identity = withBackgroundDrain(async () => who, (org) => scheduled.push(org));
      expect(await identity()).toBe(who);
      expect(scheduled).toEqual([]);
    }
  });
  it("a schedule that throws still returns the identity", async () => {
    const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
    const identity = withBackgroundDrain(async () => admin, () => { throw new Error("no after() here"); });
    expect(await identity()).toBe(admin);
  });
});
