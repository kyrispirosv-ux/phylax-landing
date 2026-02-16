import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Explicitly handle landing page redirects
    if (pathname === '/landing.html' || pathname === '/landing') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match all routes except static files and images
        // REMOVED 'html' from exclusion so we can catch landing.html
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
