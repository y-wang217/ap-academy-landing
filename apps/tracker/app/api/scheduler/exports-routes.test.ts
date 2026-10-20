import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NotionError } from "../../../lib/notion/staff";
import { handleExportsList, handleExportsRetry } from "../../../lib/scheduler/exports-handlers";
import { ExportRetryResponse, ExportsResponse } from "../../../lib/scheduler/schemas";
import { fixture, ORG, S1, S2, teacher } from "./booking-world.fake";

// REQ-35 AC11, AC12: the owner's list of Notion exports that are not done, and Retry.
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const NOW = new Date("2026-10-19T15:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

async function world() {
  const f = await fixture();
  const names = async () => new Map([[S1, "Ada L."], [S2, "Bo Q."]]);
  const deps = () => ({ ...f.deps(), studentNames: names });
  return { f, deps };
}

describe("GET /api/scheduler/exports", () => {
  it("lists failed, uncertain and stale rows only, with student names", async () => {
    const { f, deps } = await world();
    const failed = f.outbox.enqueue("summary", S1);
    f.outbox.row(failed)!.status = "failed";
    f.outbox.row(failed)!.lastError = "Notion returned 404";
    const uncertain = f.outbox.enqueue("daily_task", ORG);
    f.outbox.row(uncertain)!.status = "uncertain";
    const stale = f.outbox.enqueue("summary", S2);
    f.outbox.row(stale)!.requestedAt = minutesAgo(11);
    const fresh = f.outbox.enqueue("daily_task", "20000000-0000-4000-8000-000000000002");
    f.outbox.row(fresh)!.requestedAt = minutesAgo(2);
    const done = f.outbox.enqueue("summary", "30000000-0000-4000-8000-000000000003");
    f.outbox.row(done)!.status = "done";

    const r = await json(await handleExportsList(deps(), () => NOW));
    expect(r.status).toBe(200);
    expect(() => ExportsResponse.parse(r.body)).not.toThrow();
    const byId = new Map(r.body.exports.map((e: { id: string }) => [e.id, e]));
    expect([...byId.keys()].sort()).toEqual([failed, uncertain, stale].sort());
    expect(byId.get(failed)).toMatchObject({ kind: "summary", name: "Ada L.", status: "failed", lastError: "Notion returned 404" });
    expect(byId.get(uncertain)).toMatchObject({ kind: "daily_task", name: null, status: "uncertain" });
    expect(byId.get(stale)).toMatchObject({ name: "Bo Q.", status: "pending" });
  });
  it("is empty when nothing is open", async () => {
    const { deps } = await world();
    expect(await json(await handleExportsList(deps(), () => NOW))).toEqual({ status: 200, body: { exports: [] } });
  });
  it("a teacher gets the guard's denial and the store is never called", async () => {
    const { f } = await world();
    const r = await handleExportsList(f.deps(teacher), () => NOW);
    expect(r.status).toBe(403);
    expect(f.outbox.calls).toEqual([]);
  });
});

describe("POST /api/scheduler/exports/retry", () => {
  it("a failed row with no pending sibling goes back to pending and is sent now", async () => {
    const { f, deps } = await world();
    const id = f.outbox.enqueue("summary", S1);
    f.outbox.row(id)!.status = "failed";
    const r = await json(await handleExportsRetry(deps(), { id }));
    expect(r).toEqual({ status: 200, body: { id, status: "done", supersededBy: null } });
    expect(ExportRetryResponse.parse(r.body)).toBeTruthy();
    expect(f.notionWrites).toEqual([S1]);
  });
  it("a failed row while a pending row exists answers with the pending row, which is the one sent", async () => {
    const { f, deps } = await world();
    const old = f.outbox.enqueue("summary", S1);
    f.outbox.row(old)!.status = "failed";
    const pending = f.outbox.enqueue("summary", S1);
    const r = await json(await handleExportsRetry(deps(), { id: old }));
    expect(r).toEqual({ status: 200, body: { id: pending, status: "done", supersededBy: old } });
    expect(f.outbox.row(old)).toMatchObject({ status: "superseded", supersededBy: pending });
    expect(f.outbox.row(pending)!.status).toBe("done");
  });
  it("a retry that fails again says so", async () => {
    const { f, deps } = await world();
    const id = f.outbox.enqueue("summary", S1);
    f.outbox.row(id)!.status = "failed";
    const d = deps();
    const r = await json(await handleExportsRetry({ ...d, students: { ...d.students!, write: async () => { throw new NotionError("Notion returned 403", 403); } } }, { id }));
    expect(r.body).toEqual({ id, status: "failed", supersededBy: null });
  });
  it("Retry now on a pending row waiting for its next attempt sends it now", async () => {
    const { f, deps } = await world();
    const id = f.outbox.enqueue("summary", S1);
    f.outbox.row(id)!.nextAttemptAt = new Date(Date.now() + 3_600_000).toISOString();
    expect((await json(await handleExportsRetry(deps(), { id }))).body).toEqual({ id, status: "done", supersededBy: null });
  });
  it("a done row is 409 not_retryable; an unknown id is 404; a bad body is 400", async () => {
    const { f, deps } = await world();
    const id = f.outbox.enqueue("summary", S1);
    f.outbox.row(id)!.status = "done";
    expect(await json(await handleExportsRetry(deps(), { id }))).toEqual({ status: 409, body: { error: "not_retryable" } });
    expect(await json(await handleExportsRetry(deps(), { id: "40000000-0000-4000-8000-000000000004" }))).toEqual({ status: 404, body: { error: "not_found" } });
    expect((await handleExportsRetry(deps(), { id: "nope" })).status).toBe(400);
    expect((await handleExportsRetry(deps(), null)).status).toBe(400);
  });
  it("a teacher gets the guard's denial and the store records no call", async () => {
    const { f } = await world();
    const id = f.outbox.enqueue("summary", S1);
    f.outbox.row(id)!.status = "failed";
    expect((await handleExportsRetry(f.deps(teacher), { id })).status).toBe(403);
    expect(f.outbox.calls).toEqual([]);
    expect(f.outbox.row(id)!.status).toBe("failed");
  });
});

describe("routes", () => {
  const root = resolve(__dirname, "../../..");
  for (const [file, exp] of [
    ["app/api/scheduler/exports/route.ts", ["GET"]],
    ["app/api/scheduler/exports/retry/route.ts", ["POST"]],
  ] as const) {
    it(`${file} exports ${exp.join(", ")} and force-dynamic`, () => {
      const src = readFileSync(join(root, file), "utf8");
      for (const e of exp) expect(src).toMatch(new RegExp(`export (async function|const) ${e}\\b`));
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    });
  }
});
