import { AppHeader } from "@/components/AppHeader";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  // Unread notification count for the header bell. Degrades to 0 until the
  // notifications table exists (migrations/0002).
  let unread = 0;
  if (profile) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .is("read_at", null);
    unread = count ?? 0;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100">
      <AppHeader profile={profile} unread={unread} />
      {children}
    </div>
  );
}
