import Link from "next/link";
import { redirect } from "next/navigation";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { SettingsForm } from "@/components/SettingsForm";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sidebar = (
    <nav>
      <SideSection>Account</SideSection>
      <SideLink active>⚙️ Edit profile</SideLink>
      <Link href={`/u/${profile.username}`}>
        <SideLink>👤 View my profile</SideLink>
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
        <SettingsForm profile={profile} />
      </div>
    </AppBody>
  );
}
