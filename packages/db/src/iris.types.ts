// The iris schema's types (REQ-42, migration 0024). Every table is a loose
// record that apps/tracker validates with Zod at its data boundary (tracker
// ADR 0017), the way tracker.types.ts does for most tracker tables.

type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export type IrisSchema = {
  Tables: Record<string, LooseTable>;
  Views: { [_ in never]: never };
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  Enums: { [_ in never]: never };
  CompositeTypes: { [_ in never]: never };
};
