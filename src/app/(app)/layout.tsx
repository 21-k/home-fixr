import { AppHeader } from "@/components/AppHeader";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100">
      <AppHeader profile={profile} />
      {children}
    </div>
  );
}
