import { describe, expect, it } from "vitest";
import { parentInviteText } from "./parent-invite-text";

describe("parentInviteText (AC14)", () => {
  const t = parentInviteText({ firstName: "Sam", email: "mum@example.com", orgName: "AP Academy", trackerUrl: "https://www.apacademy.ca/tracker" });
  it("names the child and the address to sign in with", () => {
    expect(t.body).toContain("You can now see Sam's tracker.");
    expect(t.body).toContain("mum@example.com");
    expect(t.body).toContain("https://www.apacademy.ca/tracker");
    expect(t.body).toContain("AP Academy");
    expect(t.subject).toContain("Sam");
  });
  it("has no em-dashes", () => {
    expect(t.subject + t.body).not.toContain("—");
  });
});
