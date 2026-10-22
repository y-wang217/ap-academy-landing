import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionExpired } from "../../components/console/session-expired";

// REQ-53 AC9: a render with no session shows only the notice and a plain link to landing's /login.
describe("SessionExpired", () => {
  it("renders the notice and a plain link, no console markup", () => {
    const html = renderToStaticMarkup(createElement(SessionExpired));
    expect(html).toContain("Your session has ended.");
    expect(html).toContain('<a href="/login?next=/tracker/console"');
    expect(html).not.toContain("data-console");
    expect(html).not.toMatch(/>Console</);
  });
});
