import Link from "next/link";
import { ArrowRight, UserCog } from "lucide-react";
import type { Profile } from "@/lib/types";

/**
 * Nudge to finish a thin profile.
 *
 * Signup is deliberately minimal now, so a member can be fully active with no
 * trade or region set — which is exactly what the mentor directory and trade
 * filters sort on. This asks for it where the value is obvious, instead of at
 * the door before they've seen anything.
 */
export function ProfilePrompt({ profile }: { profile: Profile }) {
  const missing: string[] = [];
  // Null = the handle was auto-derived from the email at signup (migration
  // 0009) and the member hasn't picked or confirmed one yet.
  const needsHandle = !profile.username_changed_at && !profile.is_founding_member;
  if (needsHandle) missing.push("a handle");
  if (!profile.trade) missing.push("your trade");
  if (!profile.region) missing.push("your region");
  if (missing.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700">
        <UserCog className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-700">
          Add {missing.join(" and ")} to finish your profile
        </p>
        <p className="mt-0.5 text-[13px] text-zinc-600">
          {needsHandle
            ? `You're showing as @${profile.username}, which came from your email. Pick a handle (or keep this one) in Settings.`
            : "It's how people find you in the mentor directory and in trade filters. Takes about ten seconds."}
        </p>
      </div>
      <Link
        href={needsHandle ? "/settings#handle" : "/settings"}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
      >
        Finish profile <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
