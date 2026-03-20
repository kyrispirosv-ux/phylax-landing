import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
    // Legacy redirect for landing.html
    if (request.nextUrl.pathname === '/landing.html') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    // For the marketing site, no auth checks are needed.
    // All authenticated routes live on app.phylax.ai.
    return NextResponse.next({ request });
}
