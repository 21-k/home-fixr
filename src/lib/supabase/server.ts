import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Wires Supabase's auth cookies through Next.js's cookie store so
 * the user's session is available on the server.
 *
 * `cookies()` is async in Next.js 16, so this helper is async too — always
 * `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            // The `setAll` method was called from a Server Component. This can
            // be ignored when there is a proxy (middleware) refreshing the
            // session — see src/proxy.ts.
          }
        },
      },
    },
  );
}
