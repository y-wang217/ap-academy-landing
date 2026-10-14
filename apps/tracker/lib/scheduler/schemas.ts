import { z } from "zod";

/**
 * Strict output schemas. Handlers parse every body through these before
 * sending, so an extra field throws in tests instead of leaking. Teacher shape
 * has no email; admin adds it. Nothing financial exists here.
 */
export const StaffPublicTeacher = z.strictObject({
  id: z.guid(),
  name: z.string(),
  subjects: z.array(z.string()),
});
export const StaffPublicAdmin = z.strictObject({
  id: z.guid(),
  name: z.string(),
  subjects: z.array(z.string()),
  email: z.string().nullable(),
});

export const MeResponse = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("teacher"), staff: StaffPublicTeacher }),
  z.strictObject({ scope: z.literal("admin"), staff: StaffPublicAdmin.nullable() }),
  z.strictObject({ scope: z.literal("none") }),
]);
export const StaffListResponse = z.strictObject({ staff: z.array(StaffPublicAdmin) });
export const StaffResponseTeacher = z.strictObject({ staff: StaffPublicTeacher });
export const StaffResponseAdmin = z.strictObject({ staff: StaffPublicAdmin });
