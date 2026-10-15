// Security headers sent by every app (REQ-11). Both next.config.ts files load
// this module directly, so it must stay import-free and use only erasable
// TypeScript. A Content-Security-Policy belongs to a later card.
export const securityHeaders: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
