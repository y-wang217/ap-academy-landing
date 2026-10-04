// The tracker schema's types. orgs and memberships are written out; every other
// table is a loose record that apps/tracker validates with Zod at its data
// boundary (tracker ADR 0017). Once 0003 and 0004 are applied to the live
// project and `tracker` is exposed, regenerate database.generated.ts and
// replace this file.

export type MembershipRole = "owner" | "teacher" | "student";

type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type TypedTables = {
  orgs: {
    Row: { id: string; name: string; logo_url: string | null; created_at: string };
    Insert: { id?: string; name: string; logo_url?: string | null; created_at?: string };
    Update: { id?: string; name?: string; logo_url?: string | null; created_at?: string };
    Relationships: [];
  };
  memberships: {
    Row: { user_id: string; org_id: string; role: MembershipRole; created_at: string };
    Insert: { user_id: string; org_id: string; role: MembershipRole; created_at?: string };
    Update: { user_id?: string; org_id?: string; role?: MembershipRole; created_at?: string };
    Relationships: [];
  };
};

export type TrackerSchema = {
  Tables: TypedTables & Record<string, LooseTable>;
  Views: { [_ in never]: never };
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  Enums: { membership_role: MembershipRole };
  CompositeTypes: { [_ in never]: never };
};
