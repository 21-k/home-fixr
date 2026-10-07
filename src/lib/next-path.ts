// "Return here after signing in" helpers, shared by the Proxy, the login page,
// the sign-in action, the OAuth callback and every "Sign in" link.

/**
 * `next` if it's a same-site path, else null. Rejects absolute URLs,
 * protocol-relative `//host`, `/\host` (browsers treat `\` as `/`) and
 * anything with control characters, so `?next=` can't become an open redirect.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\\]/.test(next)) return null;
  // Never bounce back into the auth screens themselves.
  if (/^\/(login|join|auth)(\/|\?|$)/.test(next)) return null;
  return next;
}

/** `/login`, carrying the page to come back to (when there's one worth keeping). */
export function loginHref(next?: string | null): string {
  const n = safeNext(next);
  return n && n !== "/" ? `/login?next=${encodeURIComponent(n)}` : "/login";
}
