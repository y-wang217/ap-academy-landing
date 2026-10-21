import { describe, expect, it } from "vitest";
import { stripQuoted } from "./quote";

// REQ-43 AC12: the classifier sees the new message, not the quoted history.
describe("stripQuoted", () => {
  it("cuts a Gmail quote, on one line or wrapped over two", () => {
    expect(stripQuoted("Sam is sick today.\n\nOn Mon, Oct 20, 2026 at 9:00 AM Charlie <charlie@apacademy.ca> wrote:\n> See you Tuesday")).toBe("Sam is sick today.");
    expect(stripQuoted("Sam is sick today.\nOn Mon, Oct 20, 2026 at 9:00 AM Charlie <\ncharlie@apacademy.ca> wrote:\n> See you")).toBe("Sam is sick today.");
  });

  it("cuts an Outlook quote, by the Original Message line or a From line followed by Sent", () => {
    expect(stripQuoted("Can we move it?\n-----Original Message-----\nFrom: Charlie\nOld text")).toBe("Can we move it?");
    expect(stripQuoted("Can we move it?\n\nFrom: Charlie <charlie@apacademy.ca>\nTo: Ann\nSent: Monday\nSubject: Classes\nOld text")).toBe("Can we move it?");
    expect(stripQuoted("Can we move it?\nFrom: my phone\nnot a header block")).toBe("Can we move it?\nFrom: my phone\nnot a header block");
  });

  it("drops > lines anywhere", () => {
    expect(stripQuoted("> old line\nNew line\n>> older")).toBe("New line");
  });

  it("falls back to the first 2,000 characters when nothing is left", () => {
    expect(stripQuoted("> only quoted text")).toBe("> only quoted text");
    expect(stripQuoted(`> ${"x".repeat(3000)}`)).toHaveLength(2000);
  });
});
