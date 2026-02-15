import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

export async function createServerSupabase() {
    const cookieStore = await cookies();
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        );
                    } catch {
                        // setAll can fail in Server Components — safe to ignore.
                        // Middleware will refresh the session cookie instead.
                    }
                },
            },
        },
    );
}

/**
 * Service-role client for API routes that bypass RLS.
 * Untyped: API routes handle their own validation and the
 * Supabase SDK's type inference produces `never` for mutations
 * when using the generated Database type.
 */
export function createServiceClient() {
    const { createClient: createSBClient } = require("@supabase/supabase-js");
    return createSBClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
    );
}
