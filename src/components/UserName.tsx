import Link from "next/link";
import { FoundingBadge } from "@/components/FoundingBadge";
import { displayName } from "@/lib/display";
import type { DisplayPreference } from "@/lib/types";

type Person = {
  username: string;
  full_name?: string | null;
  display_preference?: DisplayPreference | null;
  is_founding_member?: boolean | null;
};

/**
 * A member's public name (via displayName) linked to their profile, followed
 * by the Founding Community badge when it applies. Use this anywhere another
 * person's name is shown so the disclosure can't be forgotten on one surface.
 */
export function UserName({
  person,
  className = "font-semibold text-zinc-900 hover:text-brand-500",
  link = true,
  badgeSize = "sm",
}: {
  person: Person | null | undefined;
  className?: string;
  link?: boolean;
  badgeSize?: "sm" | "md";
}) {
  if (!person) return <span className={className}>Unknown</span>;
  const name = displayName(person);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {link ? (
        <Link href={`/u/${person.username}`} className={className}>
          {name}
        </Link>
      ) : (
        <span className={className}>{name}</span>
      )}
      {person.is_founding_member && <FoundingBadge size={badgeSize} />}
    </span>
  );
}
