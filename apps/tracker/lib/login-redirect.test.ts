import { describe, expect, it } from "vitest";
import { loginRedirectFor } from "./login-redirect";

describe("loginRedirectFor", () => {
  it("sends the tracker root to /login?next=/tracker", () => {
    expect(loginRedirectFor({ basePath: "/tracker", pathname: "/", search: "" })).toBe(
      "/login?next=/tracker",
    );
  });

  it("keeps the full path and query, outside the basePath", () => {
    expect(
      loginRedirectFor({ basePath: "/tracker", pathname: "/courses/42", search: "?tab=grades" }),
    ).toBe("/login?next=/tracker/courses/42%3Ftab%3Dgrades");
  });

  it("is always relative, never an absolute URL", () => {
    const location = loginRedirectFor({ basePath: "/tracker", pathname: "/x", search: "" });
    expect(location.startsWith("/login?")).toBe(true);
  });
});
