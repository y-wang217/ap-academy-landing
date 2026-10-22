import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// REQ-55 AC10: without CONSOLE_PREVIEW=1 the preview page is a 404 at request time too.
const { NOT_FOUND, notFound } = vi.hoisted(() => {
  const NOT_FOUND = new Error("NEXT_NOT_FOUND sentinel");
  return {
    NOT_FOUND,
    notFound: vi.fn(() => {
      throw NOT_FOUND;
    }),
  };
});
vi.mock("next/navigation", () => ({ notFound }));

const ORIGINAL = process.env.CONSOLE_PREVIEW;
const params = { searchParams: Promise.resolve({ mode: "sales" }) };
const load = async () => (await import("./page.preview")).default;

beforeEach(() => notFound.mockClear());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CONSOLE_PREVIEW;
  else process.env.CONSOLE_PREVIEW = ORIGINAL;
});

describe("console preview page", () => {
  it("is notFound() with the flag unset", async () => {
    delete process.env.CONSOLE_PREVIEW;
    const page = await load();
    await expect(page(params)).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('is notFound() with the flag "0"', async () => {
    process.env.CONSOLE_PREVIEW = "0";
    const page = await load();
    await expect(page(params)).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('renders the bridge with the flag "1"', async () => {
    process.env.CONSOLE_PREVIEW = "1";
    const page = await load();
    const out = renderToStaticMarkup((await page(params)) as ReactElement);
    expect(out).toContain("data-console");
    expect(out).toContain("data-panel-value");
    expect(notFound).not.toHaveBeenCalled();
  });
});
