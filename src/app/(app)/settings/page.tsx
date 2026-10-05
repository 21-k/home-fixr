import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon, User } from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { SettingsForm } from "@/components/SettingsForm";
import { getCurrentProfile } from "@/lib/auth/session";
import { HANDLE_CHANGE_DAYS } from "@/lib/handles";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const nextHandleChange = nextHandleChangeAt(profile.username_changed_at);

  const sidebar = (
    <nav>
      <SideSection>Account</SideSection>
      <SideLink active>
        <SettingsIcon className="size-4" /> Edit profile
      </SideLink>
      <Link href={`/u/${profile.username}`}>
        <SideLink>
          <User className="size-4" /> View my profile
        </SideLink>
      </Link>
      <Link href="/feed">
        <SideLink>← Back to feed</SideLink>
      </Link>
    </nav>
  );

  return (
    <AppBody sidebar={sidebar}>
      <h1 className="mb-1 text-xl font-semibold">Edit profile</h1>
      <p className="mb-5 text-[13px] text-zinc-600">
        This is what the community sees on your profile.
      </p>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <SettingsForm profile={profile} nextHandleChange={nextHandleChange} />
      </div>
    </AppBody>
  );
}

/**
 * When can the handle next change? Null = now. The DB enforces the same
 * 30-day rule (migration 0009); this only drives the disabled state.
 */
function nextHandleChangeAt(changedAt: string | null): string | null {
  if (!changedAt) return null;
  const next = new Date(changedAt);
  next.setDate(next.getDate() + HANDLE_CHANGE_DAYS);
  return next.getTime() > Date.now() ? next.toISOString() : null;
}
