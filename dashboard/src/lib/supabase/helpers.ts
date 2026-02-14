import { createClient as createRawClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Get an untyped Supabase client for insert/update/delete mutations.
 * The typed client produces `never` for mutation params due to SDK inference issues.
 * Reads still use the typed client for autocomplete.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMutationClient(supabase: SupabaseClient<Database>): SupabaseClient<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

type ParentInfo = {
  id: string;
  family_id: string;
  display_name: string;
  role: string;
};

/**
 * Get the current authenticated user's parent record.
 * Returns null if not authenticated or parent record doesn't exist.
 */
export async function getParentInfo(
  supabase: SupabaseClient<Database>,
): Promise<ParentInfo | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("parents")
    .select("id, family_id, display_name, role")
    .eq("id", user.id)
    .single();

  return data as ParentInfo | null;
}
