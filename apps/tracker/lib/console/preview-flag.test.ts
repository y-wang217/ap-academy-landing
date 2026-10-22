import { describe, expect, it } from "vitest";
import { PREVIEW_ENV, pageExtensionsFor, previewEnabled } from "./preview-flag";

// REQ-55 AC10: the preview route is not even a route unless CONSOLE_PREVIEW=1.
describe("preview flag", () => {
  it("names CONSOLE_PREVIEW", () => {
    expect(PREVIEW_ENV).toBe("CONSOLE_PREVIEW");
  });

  it("leaves the preview page out of a normal build", () => {
    expect(pageExtensionsFor({})).toEqual(["tsx", "ts", "jsx", "js"]);
    expect(pageExtensionsFor({ CONSOLE_PREVIEW: "0" })).toEqual(["tsx", "ts", "jsx", "js"]);
  });

  it("adds preview.tsx with the flag", () => {
    expect(pageExtensionsFor({ CONSOLE_PREVIEW: "1" })).toEqual(["tsx", "ts", "jsx", "js", "preview.tsx"]);
  });

  it.each([[undefined, false], ["", false], ["0", false], ["true", false], ["yes", false], ["1", true]])("%j enabled is %j", (value, enabled) => {
    expect(previewEnabled({ CONSOLE_PREVIEW: value })).toBe(enabled);
  });
});
