/**
 * Hand-written to match supabase/migrations/0001_sat_accounts.sql. Kept small
 * on purpose — regenerate with the Supabase CLI if the schema grows.
 */
export type Profile = {
  id: string;
  email: string;
  marketing_consent: boolean;
  consent_timestamp: string | null;
  created_at: string;
};

export type Attempt = {
  id: number;
  user_id: string;
  word_id: number;
  correct: boolean;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at"> & { created_at?: string };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      attempts: {
        Row: Attempt;
        Insert: Omit<Attempt, "id" | "created_at"> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<Omit<Attempt, "id">>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
