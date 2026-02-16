import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    const url = request.nextUrl;
    const { pathname } = url;

    // FORCE REDIRECT: landing.html -> home
    if (pathname === '/landing.html' || pathname === '/landing') {
        const homeUrl = new URL('/', request.url);
        return NextResponse.redirect(homeUrl);
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match all routes except static files and images
        // CRITICAL: We REMOVED 'html' from the exclusion regex so we can catch landing.html
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
