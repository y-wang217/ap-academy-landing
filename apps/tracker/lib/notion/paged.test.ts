import { describe, expect, it } from "vitest";
import { json, notionFake, onlyReads } from "./console-reader.fake";
import { pagedQuery, propertyFilter } from "./paged";
import { NotionError } from "./staff";

// REQ-54 AC4: the shared bounded pager stops at the cap and says so instead of throwing.
const DS = "772939bd-bd88-4272-9f1f-20ce75ef2204";
const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` }));
const read = (fetcher: typeof fetch, maxPages = 10) =>
  pagedQuery({ token: "t", fetcher, dataSourceId: DS, filterQuery: "filter_properties[]=a", body: { sorts: [] }, maxPages });

describe("pagedQuery", () => {
  it("one page: complete, page_size 100, the filter query and body sent", async () => {
    const f = notionFake({ dataSourceId: DS, schema: {}, pages: [rows(3)] });
    expect(await read(f.fetcher)).toEqual({ rows: rows(3), complete: true, pages: 1 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`https://api.notion.com/v1/data_sources/${DS}/query?filter_properties[]=a`);
    expect(f.calls[0].body).toEqual({ page_size: 100, sorts: [] });
  });

  it("three pages: follows the cursor and keeps every row", async () => {
    const f = notionFake({ dataSourceId: DS, schema: {}, pages: [rows(2), rows(2, 2), rows(1, 4)] });
    const r = await read(f.fetcher);
    expect(r).toEqual({ rows: rows(5), complete: true, pages: 3 });
    expect(f.calls.map((c) => c.body?.start_cursor)).toEqual([undefined, "c1", "c2"]);
    expect(onlyReads(f.calls, DS)).toBe(true);
  });

  it("stops at maxPages with has_more still true: complete false, rows kept", async () => {
    const f = notionFake({ dataSourceId: DS, schema: {}, pages: [rows(2), rows(2, 2), rows(2, 4)] });
    expect(await read(f.fetcher, 2)).toEqual({ rows: rows(4), complete: false, pages: 2 });
    expect(f.calls).toHaveLength(2);
  });

  it("a malformed body throws Unexpected Notion response", async () => {
    const fetcher = (async () => json({ nope: true })) as unknown as typeof fetch;
    await expect(read(fetcher)).rejects.toThrow("Unexpected Notion response");
  });

  it("a 429 keeps Retry-After and never echoes the body", async () => {
    const f = notionFake({ dataSourceId: DS, schema: {}, pages: [], queryStatus: 429 });
    const err = await read(f.fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(NotionError);
    expect(err.message).toBe("Notion returned 429");
    expect(err.retryAfterSeconds).toBe(7);
    expect(err.message).not.toContain("Sam");
  });

  it("an abort reaches the caller as the abort, not a generic failure", async () => {
    const fetcher = (async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch;
    const err = await read(fetcher).catch((e) => e);
    expect(err.name).toBe("AbortError");
  });

  it("a network failure is Notion request failed", async () => {
    const fetcher = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(read(fetcher)).rejects.toThrow("Notion request failed");
  });
});

describe("propertyFilter", () => {
  it("maps names to filter_properties ids with one schema GET", async () => {
    const f = notionFake({ dataSourceId: DS, schema: { Type: "t%3A1", Note: "no" }, pages: [] });
    expect(await propertyFilter("t", f.fetcher, DS, ["Type", "Note"], "Touches")).toBe("filter_properties[]=t%3A1&filter_properties[]=no");
    expect(f.calls).toEqual([expect.objectContaining({ method: "GET", url: `https://api.notion.com/v1/data_sources/${DS}` })]);
  });

  it("a missing property throws with the label and its name", async () => {
    const f = notionFake({ dataSourceId: DS, schema: { Type: "t" }, pages: [] });
    await expect(propertyFilter("t", f.fetcher, DS, ["Type", "Outcome"], "Touches")).rejects.toThrow("Touches is missing Outcome");
  });

  it("a non-2xx schema answer is Notion returned <status>", async () => {
    const fetcher = (async () => json({}, 404)) as unknown as typeof fetch;
    await expect(propertyFilter("t", fetcher, DS, ["Type"], "Touches")).rejects.toThrow("Notion returned 404");
  });
});
