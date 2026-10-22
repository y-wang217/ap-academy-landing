import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-58 AC11: nothing this card adds writes, or reaches the scheduler identity or the lesson-port writes.
const APP = join(__dirname, "../..");
const FILES = ["lib/domain/schedule/operations.ts", "lib/console/operations.ts", "lib/console/operations-read.ts", "components/console/teacher-load.tsx", "components/console/lesson-gaps.tsx"];

describe.each(FILES)("%s", (f) => {
  const src = readFileSync(join(APP, f), "utf8");
  it("makes no write call", () => {
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(|rpc\(/);
    expect(src).not.toMatch(/\b(createLesson|linkLesson|unlinkLesson|claim|takeOver|complete|insertNoShow)\(/);
  });
  it("does not use the scheduler guard or identity", () => {
    expect(src).not.toMatch(/scheduler\/guard|identity|requireScheduler/);
  });
});

describe("the Lessons port", () => {
  it("providers.ts calls only listUnlinkedLessons on it for Operations", () => {
    const src = readFileSync(join(APP, "lib/console/providers.ts"), "utf8");
    const body = src.slice(src.indexOf("export function createOperationsLessons"));
    expect(body).toContain(".listUnlinkedLessons(range)");
    expect(body).not.toMatch(/\.(createLesson|linkLesson|unlinkLesson|findLessonFor|getLesson)\(/);
  });
});
