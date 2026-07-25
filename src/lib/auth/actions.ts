"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type AuthState = { error?: string; message?: string };

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function usernameFrom(email: string): string {
  return (email.split("@")[0] || "member")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/feed");
}

/**
 * Signup collects the minimum: name, email, password, and which side of the
 * trade you're on. Trade, region, years, and title are asked at /welcome once
 * the user is already inside — a stranger deciding whether to trust us should
 * not be facing a seven-field form.
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "junior") as UserRole;

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (!fullName) return { error: "Please tell us your name." };
  if (role !== "junior" && role !== "senior")
    return { error: "Please pick how you'll use Home Fixr." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        username: usernameFrom(email),
        avatar_initials: initialsFrom(fullName),
        role,
      },
    },
  });

  if (error) return { error: error.message };

  // Email confirmation OFF -> a session exists immediately.
  if (data.session) redirect("/welcome");

  // Email confirmation ON -> no session yet.
  return {
    message:
      "Account created! Check your email to confirm your address, then sign in.",
  };
}

/**
 * Kick off Google OAuth. Supabase returns a URL we redirect the browser to;
 * Google then bounces back to /auth/callback with a code to exchange.
 *
 * Requires the Google provider to be enabled in Supabase → Authentication →
 * Sign In / Providers, with a Google Cloud OAuth client's ID and secret.
 */
export async function signInWithGoogle(): Promise<AuthState> {
  const supabase = await createClient();

  // Derive the origin from the request so this works on localhost, Vercel
  // previews, and the production domain without per-environment config.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) return { error: error.message };
  if (!data.url) return { error: "Could not start Google sign-in." };

  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
