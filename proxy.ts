import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;



    // Fail-safe redirect for landing pages
    if (pathname === '/landing.html' || pathname === '/landing') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match all routes except static files and images
        // Explicity include html files in matcher by altering negative lookahead
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
