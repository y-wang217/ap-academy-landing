// Hand-written to match supabase/migrations/0003_tracker_schema.sql, because
// that migration is not applied to the live project yet and types can only be
// generated from a running database. Once it is applied and `tracker` is an
// exposed schema, regenerate database.generated.ts and delete this file.

export type MembershipRole = "owner" | "teacher" | "student";

export type TrackerSchema = {
  Tables: {
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
      Relationships: [
        {
          foreignKeyName: "memberships_org_id_fkey";
          columns: ["org_id"];
          isOneToOne: false;
          referencedRelation: "orgs";
          referencedColumns: ["id"];
        },
      ];
    };
  };
  Views: { [_ in never]: never };
  Functions: { [_ in never]: never };
  Enums: { membership_role: MembershipRole };
  CompositeTypes: { [_ in never]: never };
};
