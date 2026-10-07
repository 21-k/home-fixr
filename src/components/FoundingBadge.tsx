import Link from "next/link";

/**
 * Disclosure badge for accounts seeded by the Home Fixr team (plan §0.3).
 * Rendered next to the name everywhere a Founding Community member appears.
 * Links to the About page that explains what these accounts are.
 */
export function FoundingBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "px-2 py-0.5 text-xs"
      : "px-1.5 py-px text-[10px]";
  return (
    <Link
      href="/about#founding-community"
      title="Founding Community account: set up by the Home Fixr team to seed early discussions. Click to learn more."
      className={`inline-flex shrink-0 items-center rounded border border-amber-300 bg-amber-50 font-semibold uppercase tracking-wide text-amber-800 hover:bg-amber-100 ${cls}`}
    >
      Founding Community
    </Link>
  );
}
