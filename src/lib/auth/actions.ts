"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, TradeType } from "@/lib/types";

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

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "junior") as UserRole;
  const trade = String(formData.get("trade") ?? "") as TradeType | "";
  const region = String(formData.get("region") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const yearsRaw = String(formData.get("years_experience") ?? "").trim();

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
        trade: trade || null,
        region: region || null,
        title: title || (role === "senior" ? "Senior pro" : "New to the trade"),
        years_experience: yearsRaw || null,
      },
    },
  });

  if (error) return { error: error.message };

  // Email confirmation OFF -> a session exists immediately, so go to the feed.
  if (data.session) redirect("/feed");

  // Email confirmation ON -> no session yet.
  return {
    message:
      "Account created! Check your email to confirm your address, then sign in.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
