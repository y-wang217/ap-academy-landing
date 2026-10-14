import { describe, expect, it } from "vitest";
import { bookingMessage, dropLabel } from "./booking-text";

const p = (reason: string) => ({ date: "2026-10-21", startTime: "16:00", endTime: "17:00", reason });

describe("bookingMessage (AC18)", () => {
  it("names the teacher and the slot", () => {
    expect(bookingMessage([p("teacher_busy")], 0, "Ryan")).toBe("Not saved: Ryan already has a class Wed Oct 21 16:00-17:00.");
    expect(bookingMessage([p("student_busy")], 0, "Ryan")).toBe("Not saved: the student already has a class Wed Oct 21 16:00-17:00.");
    expect(bookingMessage([p("outside_availability")], 0, "Ryan")).toBe("Not saved: Ryan is not available then.");
    expect(bookingMessage([p("time_off")], 0, "Ryan")).toBe("Not saved: Ryan has time off then.");
    expect(bookingMessage([p("availability_not_entered")], 0, "Ryan")).toBe("Not saved: Ryan has no availability entered.");
  });
  it("mentions how many more dates have problems", () => {
    expect(bookingMessage([p("time_off")], 3, "Ryan")).toBe("Not saved: Ryan has time off then. 3 more dates have problems.");
    expect(bookingMessage([p("time_off")], 1, "Ryan")).toBe("Not saved: Ryan has time off then. 1 more date has a problem.");
  });
  it("falls back to a plain message", () => {
    expect(bookingMessage([], 0, "Ryan")).toBe("Not saved. Please try again.");
  });
});

describe("dropLabel", () => {
  it("is the text shown beside the ghost", () => {
    expect(dropLabel("2026-10-21", "16:00", 60)).toBe("Wed Oct 21 16:00-17:00");
  });
});
