import type { z } from "zod";

/**
 * Every field path of a Zod schema, dotted, arrays as `[]` (REQ-40 AC7, AC12).
 * Walks objects, arrays, nullable and optional wrappers; anything else is a leaf.
 */
export function schemaKeys(schema: z.ZodType, prefix = ""): string[] {
  const def = (schema as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType } }).def;
  if (def.type === "object" && def.shape) {
    return Object.entries(def.shape).flatMap(([k, v]) => [`${prefix}${k}`, ...schemaKeys(v, `${prefix}${k}.`)]);
  }
  if (def.type === "array" && def.element) return schemaKeys(def.element, prefix.replace(/\.$/, "[].")) ;
  if ((def.type === "nullable" || def.type === "optional") && def.innerType) return schemaKeys(def.innerType, prefix);
  return [];
}
