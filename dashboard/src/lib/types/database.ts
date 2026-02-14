// Auto-generate this with: npx supabase gen types typescript --project-id YOUR_PROJECT_ID
// For now, manual types matching 001_initial_schema.sql

export type Database = {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      parents: {
        Row: {
          id: string;
          family_id: string;
          display_name: string;
          role: "owner" | "co_parent" | "viewer";
          created_at: string;
        };
        Insert: {
          id: string;
          family_id: string;
          display_name?: string;
          role?: "owner" | "co_parent" | "viewer";
          created_at?: string;
        };
        Update: {
          display_name?: string;
          role?: "owner" | "co_parent" | "viewer";
        };
      };
      children: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          age: number | null;
          tier: "kid_10" | "tween_13" | "teen_16";
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          age?: number | null;
          tier?: "kid_10" | "tween_13" | "teen_16";
          avatar_url?: string | null;
        };
        Update: {
          name?: string;
          age?: number | null;
          tier?: "kid_10" | "tween_13" | "teen_16";
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      devices: {
        Row: {
          id: string;
          child_id: string;
          family_id: string;
          platform: "chrome" | "ios" | "android";
          device_name: string;
          extension_version: string | null;
          pairing_code: string | null;
          status: "active" | "inactive" | "pending";
          last_heartbeat: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          child_id: string;
          family_id: string;
          platform?: "chrome" | "ios" | "android";
          device_name?: string;
          pairing_code?: string | null;
        };
        Update: {
          device_name?: string;
          extension_version?: string | null;
          status?: "active" | "inactive" | "pending";
          last_heartbeat?: string | null;
        };
      };
      rules: {
        Row: {
          id: string;
          family_id: string;
          child_id: string | null;
          text: string;
          active: boolean;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          child_id?: string | null;
          text: string;
          active?: boolean;
          sort_order?: number;
          created_by?: string | null;
        };
        Update: {
          text?: string;
          active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
      };
      alerts: {
        Row: {
          id: string;
          family_id: string;
          child_id: string | null;
          device_id: string | null;
          alert_type: string;
          severity: "info" | "warning" | "critical";
          title: string;
          body: string | null;
          url: string | null;
          domain: string | null;
          reason_code: string | null;
          confidence: number | null;
          evidence: unknown | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          child_id?: string | null;
          device_id?: string | null;
          alert_type: string;
          severity?: "info" | "warning" | "critical";
          title: string;
          body?: string | null;
          url?: string | null;
          domain?: string | null;
          reason_code?: string | null;
          confidence?: number | null;
          evidence?: unknown | null;
        };
        Update: {
          read?: boolean;
        };
      };
      decision_log: {
        Row: {
          id: number;
          family_id: string;
          child_id: string | null;
          device_id: string | null;
          action: string;
          reason_code: string | null;
          domain: string | null;
          confidence: number | null;
          topic_scores: unknown | null;
          created_at: string;
        };
        Insert: {
          family_id: string;
          child_id?: string | null;
          device_id?: string | null;
          action: string;
          reason_code?: string | null;
          domain?: string | null;
          confidence?: number | null;
          topic_scores?: unknown | null;
        };
        Update: never;
      };
    };
    Enums: {
      parent_role: "owner" | "co_parent" | "viewer";
      profile_tier: "kid_10" | "tween_13" | "teen_16";
      device_platform: "chrome" | "ios" | "android";
      device_status: "active" | "inactive" | "pending";
      alert_severity: "info" | "warning" | "critical";
    };
  };
};
