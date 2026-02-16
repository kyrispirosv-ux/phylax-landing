import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value),
                        );
                        supabaseResponse = NextResponse.next({ request });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options),
                        );
                    },
                },
            },
        );

        // Refresh session if expired - required for Server Components
        // https://supabase.com/docs/guides/auth/server-side/nextjs
        const {
            data: { user },
        } = await supabase.auth.getUser();

        // Redirect unauthenticated users to login (except auth pages and API routes)
        const path = request.nextUrl.pathname;

        // Public paths that don't require auth
        if (
            !user &&
            !path.startsWith("/auth") && // Login/Signup
            !path.startsWith("/api") && // API routes (handle their own auth or are public)
            !path.startsWith("/pair") && // Install/Pairing landing page
            !path.startsWith("/onboarding") && // Onboarding flow
            !path.startsWith("/_next") && // Next.js internals
            !path.startsWith("/static") && // Static files
            path !== "/" && // Landing page
            path !== "/landing.html" // Legacy landing page
        ) {
            const url = request.nextUrl.clone();
            url.pathname = "/auth/signup"; // Defaulting to signup since login might be missing logic
            return NextResponse.redirect(url);
        }

        // Redirect authenticated users away from auth pages?
        // Maybe not strict redirect for now to avoid loops if signup is the only page
        if (user && path === "/auth/signup") {
            const url = request.nextUrl.clone();
            url.pathname = "/dashboard";
            return NextResponse.redirect(url);
        }

        return supabaseResponse;
    } catch (e) {
        // If supabase fails (e.g. invalid URL), allow request to proceed but log error
        // This prevents the whole site from 500ing if env vars are bad, though auth won't work
        console.error("Middleware Supabase Error:", e);
        return NextResponse.next({ request });
    }
}
