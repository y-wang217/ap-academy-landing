/** Deployment-specific strings live here, not in components (plan item 16). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.apacademy.ca").replace(/\/+$/, "");
export const TRACKER_URL = `${SITE_URL}/tracker`;
