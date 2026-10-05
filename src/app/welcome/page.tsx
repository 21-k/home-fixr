import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { WelcomeForm } from "@/components/WelcomeForm";
import { firstNameInitial } from "@/lib/display";

/**
 * The post-signup step. Signup asks only for the essentials, so this is where
 * trade, region, and experience get collected — after the user is already in,
 * where a few questions read as setup rather than as a barrier.
 */
export default async function WelcomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Already done? Nothing to ask.
  if (profile.onboarded_at) redirect("/feed");

  return (
    <div className="min-h-dvh bg-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
            HF
          </span>
          Home Fixr
        </Link>
        <span className="text-sm text-zinc-500">Step 2 of 2</span>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Private context: this is the member's own name, shown only to them. */}
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome, {firstNameInitial(profile.full_name).split(" ")[0] || "there"}.
        </h1>
        <p className="mt-2 mb-8 text-[15px] leading-7 text-zinc-600">
          A few quick things so we can point you at the right people. You can
          change any of this later in Settings.
        </p>

        <WelcomeForm profile={profile} />
      </div>
    </div>
  );
}
