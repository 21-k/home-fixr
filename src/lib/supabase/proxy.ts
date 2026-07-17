import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the user's Supabase auth session on each request and forwards the
 * updated auth cookies to both the request and the response. Called from the
 * root `proxy.ts` (Next.js 16's renamed Middleware).
 *
 * This only keeps the session token fresh — it is NOT an authorization layer.
 * Per the Next.js 16 Proxy docs, gate protected routes in the page/layout or a
 * Route Handler, not here.
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
  await supabase.auth.getUser();

  return response;
}
