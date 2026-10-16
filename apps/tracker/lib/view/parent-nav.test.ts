import { describe, expect, it } from "vitest";
import { childPills, parentLanding, parentTabs } from "./parent-nav";

const sam = { id: "11111111-1111-1111-1111-111111111111", firstName: "Sam", lastInitial: "L", published: true };
const bea = { id: "22222222-2222-2222-2222-222222222222", firstName: "Bea", lastInitial: "K", published: false };

describe("parentLanding (AC9)", () => {
  it("is the first child's grades page", () => {
    expect(parentLanding([sam, bea])).toBe(`/parent/${sam.id}/grades`);
  });
  it("is null with no children", () => {
    expect(parentLanding([])).toBeNull();
  });
});

describe("childPills (AC10)", () => {
  it("shows no pills for one child", () => {
    expect(childPills([sam], sam.id, "grades")).toEqual([]);
  });
  it("shows a pill per child, keeping the current tab", () => {
    expect(childPills([sam, bea], sam.id, "calendar")).toEqual([
      { id: sam.id, label: "Sam", href: `/parent/${sam.id}/calendar`, current: true },
      { id: bea.id, label: "Bea", href: `/parent/${bea.id}/calendar`, current: false },
    ]);
  });
});

describe("parentTabs (AC10)", () => {
  it("lists Grades, Calendar and Billing with hrefs and the current flag", () => {
    expect(parentTabs(sam.id, "billing")).toEqual([
      { key: "grades", label: "Grades", href: `/parent/${sam.id}/grades`, current: false },
      { key: "calendar", label: "Calendar", href: `/parent/${sam.id}/calendar`, current: false },
      { key: "billing", label: "Billing", href: `/parent/${sam.id}/billing`, current: true },
    ]);
  });
});
