/**
 * A tiny Notion behind fetch for the console reader tests (REQ-54): one data
 * source schema and its query results split into pages by cursor. Records
 * every request so a test can assert the method and path of each one.
 */
export type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

export function notionFake(opts: {
  dataSourceId: string;
  /** Property name to ID. */
  schema: Record<string, string>;
  /** Query results, one array per Notion page of results. The last has has_more false unless `hasMoreAtEnd`. */
  pages: ReadonlyArray<ReadonlyArray<unknown>>;
  hasMoreAtEnd?: boolean;
  queryStatus?: number;
}) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const path = new URL(url).pathname;
    if (call.method === "GET" && path === `/v1/data_sources/${opts.dataSourceId}`) {
      return json({ properties: Object.fromEntries(Object.entries(opts.schema).map(([n, id]) => [n, { id }])) });
    }
    if (call.method === "POST" && path === `/v1/data_sources/${opts.dataSourceId}/query`) {
      if (opts.queryStatus) return json({ message: "Student Sam Lee" }, opts.queryStatus, { "retry-after": "7" });
      const cursor = call.body?.start_cursor;
      const i = typeof cursor === "string" ? Number(cursor.slice(1)) : 0;
      const last = i >= opts.pages.length - 1;
      const more = !last || Boolean(opts.hasMoreAtEnd);
      return json({ results: opts.pages[i] ?? [], has_more: more, next_cursor: more ? `c${i + 1}` : null });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

/** Every request a read-only console reader may make (AC6). */
export function onlyReads(calls: Call[], dataSourceId: string): boolean {
  return calls.every((c) => {
    const path = new URL(c.url).pathname;
    return (c.method === "GET" && path === `/v1/data_sources/${dataSourceId}`) || (c.method === "POST" && path === `/v1/data_sources/${dataSourceId}/query`);
  });
}

export const filterIds = (c: Call) => new URL(c.url).searchParams.getAll("filter_properties[]");

/** Notion property value builders. */
export const v = {
  title: (s: string) => ({ type: "title", title: s ? [{ plain_text: s }] : [] }),
  text: (s: string) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] }),
  select: (s: string | null) => ({ type: "select", select: s === null ? null : { name: s } }),
  multi: (names: string[]) => ({ type: "multi_select", multi_select: names.map((name) => ({ name })) }),
  date: (s: string | null) => ({ type: "date", date: s === null ? null : { start: s } }),
  num: (n: number | null) => ({ type: "number", number: n }),
  rel: (...ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) }),
  created: (s: string) => ({ type: "created_time", created_time: s }),
  phone: (s: string) => ({ type: "phone_number", phone_number: s }),
  email: (s: string) => ({ type: "email", email: s }),
};
