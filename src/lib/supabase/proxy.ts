import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loginHref } from "@/lib/next-path";

/**
 * Member-only pages. A logged-out request gets a real 307 to
 * /login?next=<page> here, before rendering starts: once a page under
 * (app)/ begins streaming, a redirect() in it can only be a client-side
 * meta refresh. The pages still check the session themselves.
 */
const MEMBER_ONLY = ["/messages", "/notifications", "/mentorships", "/settings", "/welcome"];

/**
 * Refreshes the user's Supabase auth session on each request and forwards the
 * updated auth cookies to both the request and the response. Called from the
 * root `proxy.ts` (Next.js 16's renamed Middleware).
 *
 * Besides keeping the session fresh, it does one optimistic check: logged-out
 * visits to MEMBER_ONLY pages are redirected to login. That's a convenience,
 * not the authorization layer; pages and RLS still enforce access.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run any code between creating the client and getUser().
  // A simple mistake could make it very hard to debug intermittent logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && MEMBER_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const redirect = NextResponse.redirect(new URL(loginHref(pathname + search), request.url));
    // Keep any refreshed/cleared auth cookies on the redirect.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
