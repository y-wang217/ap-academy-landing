import { describe, expect, it } from "vitest";
import { allowedSiteHosts, isCrossSiteWrite } from "./cross-site";

const hosts = ["www.apacademy.ca", "apacademy.ca"];
const call = (o: { method?: string; secFetchSite?: string | null; origin?: string | null; allowedHosts?: readonly string[] }) =>
  isCrossSiteWrite({ method: "POST", secFetchSite: null, origin: null, allowedHosts: hosts, ...o });

describe("isCrossSiteWrite", () => {
  it("denies a write with Sec-Fetch-Site cross-site, whatever the Origin", () => {
    expect(call({ secFetchSite: "cross-site" })).toBe(true);
    expect(call({ secFetchSite: "cross-site", origin: "https://www.apacademy.ca" })).toBe(true);
  });

  it.each(["PATCH", "PUT", "DELETE", "post"])("denies %s from a foreign Origin", (method) => {
    expect(call({ method, origin: "https://evil.example" })).toBe(true);
  });

  it.each(["null", "not a url", "https://apacademy.ca.evil.example"])("denies Origin %s", (origin) => {
    expect(call({ origin })).toBe(true);
  });

  it("allows the site host with or without www, case-insensitively", () => {
    expect(call({ origin: "https://www.apacademy.ca" })).toBe(false);
    expect(call({ origin: "https://apacademy.ca" })).toBe(false);
    expect(call({ origin: "https://WWW.APACADEMY.CA" })).toBe(false);
  });

  it("compares the port as part of the host", () => {
    expect(call({ origin: "http://localhost:3000" })).toBe(true);
    expect(call({ origin: "http://localhost:3000", allowedHosts: ["localhost:3000"] })).toBe(false);
    expect(call({ origin: "http://localhost:3001", allowedHosts: ["localhost:3000"] })).toBe(true);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("allows %s whatever the headers", (method) => {
    expect(call({ method, secFetchSite: "cross-site", origin: "https://evil.example" })).toBe(false);
  });

  it("allows a write with neither header", () => {
    expect(call({})).toBe(false);
  });

  it("allows same-origin and same-site writes with an allowed Origin", () => {
    expect(call({ secFetchSite: "same-origin", origin: "https://www.apacademy.ca" })).toBe(false);
    expect(call({ secFetchSite: "same-site", origin: "https://apacademy.ca" })).toBe(false);
  });
});

describe("allowedSiteHosts", () => {
  it("returns the host and its www-less form", () => {
    expect(allowedSiteHosts("https://www.apacademy.ca")).toEqual(["www.apacademy.ca", "apacademy.ca"]);
  });

  it("deduplicates and keeps a port", () => {
    expect(allowedSiteHosts("http://localhost:3000/")).toEqual(["localhost:3000"]);
  });
});
