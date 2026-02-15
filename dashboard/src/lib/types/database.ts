// Auto-generate this with: npx supabase gen types typescript --project-id YOUR_PROJECT_ID
// Manual types matching 001_initial_schema.sql + 002_pairing_events_reports.sql

export type Database = {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          name: string;
          policy_version: number;
          policy_updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          policy_version?: number;
          policy_updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          policy_version?: number;
          policy_updated_at?: string;
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
          auth_token_hash: string | null;
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
          auth_token_hash?: string | null;
        };
        Update: {
          device_name?: string;
          extension_version?: string | null;
          auth_token_hash?: string | null;
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
          scope: "site" | "content";
          target: string | null;
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
          scope?: "site" | "content";
          target?: string | null;
          active?: boolean;
          sort_order?: number;
          created_by?: string | null;
        };
        Update: {
          text?: string;
          scope?: "site" | "content";
          target?: string | null;
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
      pairing_tokens: {
        Row: {
          id: string;
          family_id: string;
          child_id: string;
          secret_hash: string;
          short_code_hash: string;
          expires_at: string;
          used_at: string | null;
          used_by_device_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          child_id: string;
          secret_hash: string;
          short_code_hash: string;
          expires_at: string;
          created_by: string;
        };
        Update: {
          used_at?: string;
          used_by_device_id?: string;
        };
      };
      events: {
        Row: {
          id: number;
          family_id: string;
          child_id: string | null;
          device_id: string | null;
          event_type: string;
          domain: string | null;
          url: string | null;
          category: string | null;
          rule_id: string | null;
          reason_code: string | null;
          confidence: number | null;
          metadata: unknown | null;
          created_at: string;
        };
        Insert: {
          family_id: string;
          child_id?: string | null;
          device_id?: string | null;
          event_type: string;
          domain?: string | null;
          url?: string | null;
          category?: string | null;
          rule_id?: string | null;
          reason_code?: string | null;
          confidence?: number | null;
          metadata?: unknown | null;
        };
        Update: never;
      };
      report_summaries: {
        Row: {
          id: number;
          family_id: string;
          child_id: string | null;
          period: "daily" | "weekly";
          period_start: string;
          total_events: number;
          blocked_count: number;
          allowed_count: number;
          request_access_count: number;
          top_blocked_domains: unknown;
          top_categories: unknown;
          active_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          family_id: string;
          child_id?: string | null;
          period: "daily" | "weekly";
          period_start: string;
          total_events?: number;
          blocked_count?: number;
          allowed_count?: number;
          request_access_count?: number;
          top_blocked_domains?: unknown;
          top_categories?: unknown;
          active_minutes?: number;
        };
        Update: {
          total_events?: number;
          blocked_count?: number;
          allowed_count?: number;
          request_access_count?: number;
          top_blocked_domains?: unknown;
          top_categories?: unknown;
          active_minutes?: number;
          updated_at?: string;
        };
      };
      access_requests: {
        Row: {
          id: string;
          family_id: string;
          child_id: string | null;
          device_id: string | null;
          url: string;
          domain: string | null;
          rule_id: string | null;
          reason: string | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          child_id?: string | null;
          device_id?: string | null;
          url: string;
          domain?: string | null;
          rule_id?: string | null;
          reason?: string | null;
        };
        Update: {
          status?: string;
          reviewed_by?: string;
          reviewed_at?: string;
        };
      };
    };
    Enums: {
      parent_role: "owner" | "co_parent" | "viewer";
      profile_tier: "kid_10" | "tween_13" | "teen_16";
      device_platform: "chrome" | "ios" | "android";
      device_status: "active" | "inactive" | "pending";
      alert_severity: "info" | "warning" | "critical";
      rule_scope: "site" | "content";
      report_period: "daily" | "weekly";
    };
  };
};
