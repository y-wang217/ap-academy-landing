import type { Database as Generated } from "./database.generated.ts";
import type { TrackerSchema } from "./tracker.types.ts";

export type { Json } from "./database.generated.ts";
export type { MembershipRole } from "./tracker.types.ts";

/** Every schema the apps read: `public` (SAT, accounts) and `tracker`. */
export type Database = Generated & { tracker: TrackerSchema };
