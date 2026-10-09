import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { safeNext } from "@/lib/next-path";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  // Already a member: no second account; carry on instead.
  const profile = await getCurrentProfile();
  if (profile) redirect(profile.onboarded_at ? (next ?? "/feed") : "/welcome");

  return <JoinForm next={next} initialRole={sp.role === "mentor" ? "senior" : "junior"} />;
}
