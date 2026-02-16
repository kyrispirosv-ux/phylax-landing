import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === '/landing.html') {
        return NextResponse.redirect(new URL('/', request.url));
    }
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match all routes except static files and images
        // We ALLOW html files here so we can intercept landing.html
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
