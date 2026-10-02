// Generated from the live Supabase project (ref lfvyrwzqibunljndsnxk) on
// 2026-10-02. Do not edit by hand: regenerate after every applied migration
// (Supabase MCP generate_typescript_types, or `supabase gen types typescript`).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attempts: {
        Row: {
          correct: boolean
          created_at: string
          id: number
          user_id: string
          word_id: number
        }
        Insert: {
          correct: boolean
          created_at?: string
          id?: number
          user_id: string
          word_id: number
        }
        Update: {
          correct?: boolean
          created_at?: string
          id?: number
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          consent_timestamp: string | null
          created_at: string
          email: string
          id: string
          marketing_consent: boolean
          unsubscribe_token: string
        }
        Insert: {
          consent_timestamp?: string | null
          created_at?: string
          email: string
          id: string
          marketing_consent?: boolean
          unsubscribe_token?: string
        }
        Update: {
          consent_timestamp?: string | null
          created_at?: string
          email?: string
          id?: string
          marketing_consent?: boolean
          unsubscribe_token?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      unsubscribe_by_token: { Args: { token: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
