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
          scope: "site" | "content" | "llm";
          target: string | null;
          llm_platform: "all" | "chatgpt" | "claude" | "gemini" | "grok" | null;
          llm_category: "topic_block" | "capability_block" | "persona_block" | null;
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
          scope?: "site" | "content" | "llm";
          target?: string | null;
          llm_platform?: "all" | "chatgpt" | "claude" | "gemini" | "grok" | null;
          llm_category?: "topic_block" | "capability_block" | "persona_block" | null;
          active?: boolean;
          sort_order?: number;
          created_by?: string | null;
        };
        Update: {
          text?: string;
          scope?: "site" | "content" | "llm";
          target?: string | null;
          llm_platform?: "all" | "chatgpt" | "claude" | "gemini" | "grok" | null;
          llm_category?: "topic_block" | "capability_block" | "persona_block" | null;
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
      community_posts: {
        Row: {
          id: string;
          author_id: string;
          category: "social_media" | "gaming" | "content" | "grooming" | "general";
          title: string;
          body: string;
          is_anonymous: boolean;
          rule_snapshot: { text: string; scope: string; target: string | null }[] | null;
          status: "active" | "hidden" | "removed";
          upvotes: number;
          downvotes: number;
          comment_count: number;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          category?: "social_media" | "gaming" | "content" | "grooming" | "general";
          title: string;
          body: string;
          is_anonymous?: boolean;
          rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
          status?: "active" | "hidden" | "removed";
        };
        Update: {
          title?: string;
          body?: string;
          category?: "social_media" | "gaming" | "content" | "grooming" | "general";
          is_anonymous?: boolean;
          rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
          status?: "active" | "hidden" | "removed";
          updated_at?: string;
        };
      };
      community_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_comment_id: string | null;
          body: string;
          is_anonymous: boolean;
          status: "active" | "hidden" | "removed";
          upvotes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_comment_id?: string | null;
          body: string;
          is_anonymous?: boolean;
        };
        Update: {
          body?: string;
          is_anonymous?: boolean;
          status?: "active" | "hidden" | "removed";
          updated_at?: string;
        };
      };
      community_votes: {
        Row: {
          id: string;
          user_id: string;
          target_type: "post" | "comment";
          target_id: string;
          value: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_type: "post" | "comment";
          target_id: string;
          value: number;
        };
        Update: {
          value?: number;
        };
      };
      community_presets: {
        Row: {
          id: string;
          author_id: string;
          name: string;
          description: string;
          age_range: string;
          tier: "kid_10" | "tween_13" | "teen_16";
          rules: { text: string; scope: string; target: string | null }[];
          adoption_count: number;
          rating_avg: number;
          rating_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          name: string;
          description?: string;
          age_range?: string;
          tier?: "kid_10" | "tween_13" | "teen_16";
          rules: { text: string; scope: string; target: string | null }[];
        };
        Update: {
          name?: string;
          description?: string;
          age_range?: string;
          tier?: "kid_10" | "tween_13" | "teen_16";
          rules?: { text: string; scope: string; target: string | null }[];
          updated_at?: string;
        };
      };
      community_preset_reviews: {
        Row: {
          id: string;
          preset_id: string;
          author_id: string;
          rating: number;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          preset_id: string;
          author_id: string;
          rating: number;
          body?: string;
        };
        Update: {
          rating?: number;
          body?: string;
        };
      };
      community_reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: "post" | "comment" | "preset";
          target_id: string;
          reason: string;
          status: "pending" | "reviewed" | "dismissed";
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: "post" | "comment" | "preset";
          target_id: string;
          reason: string;
        };
        Update: {
          status?: "pending" | "reviewed" | "dismissed";
        };
      };
      community_rule_stats: {
        Row: {
          id: string;
          rule_text_hash: string;
          rule_text_normalized: string;
          category: string;
          adoption_count: number;
          effectiveness_score: number;
          blocked_count_30d: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_text_hash: string;
          rule_text_normalized: string;
          category?: string;
          adoption_count?: number;
          effectiveness_score?: number;
          blocked_count_30d?: number;
        };
        Update: {
          rule_text_normalized?: string;
          category?: string;
          adoption_count?: number;
          effectiveness_score?: number;
          blocked_count_30d?: number;
          updated_at?: string;
        };
      };
    };
    Enums: {
      parent_role: "owner" | "co_parent" | "viewer";
      profile_tier: "kid_10" | "tween_13" | "teen_16";
      device_platform: "chrome" | "ios" | "android";
      device_status: "active" | "inactive" | "pending";
      alert_severity: "info" | "warning" | "critical";
      rule_scope: "site" | "content" | "llm";
      report_period: "daily" | "weekly";
      community_post_category: "social_media" | "gaming" | "content" | "grooming" | "general";
      community_content_status: "active" | "hidden" | "removed";
      community_vote_target: "post" | "comment";
      community_report_target: "post" | "comment" | "preset";
      community_report_status: "pending" | "reviewed" | "dismissed";
    };
  };
};
