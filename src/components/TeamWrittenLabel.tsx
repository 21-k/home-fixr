import Link from "next/link";
import { PenLine } from "lucide-react";
import { TEAM_WRITTEN_LABEL } from "@/lib/founding";

/**
 * "Team-written example • AI-assisted": the label on every post, reply and
 * collab the Home Fixr team wrote (see isTeamWritten). Text plus an icon and a
 * border, so it doesn't rely on colour; links to the About disclosure.
 */
export function TeamWrittenLabel({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/about#founding-community"
      data-testid="team-written-label"
      title="Written by the Home Fixr team with AI assistance to show how the community works. Not a post by a real member."
      className={`inline-flex w-fit max-w-full items-center gap-1 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-xs font-medium leading-4 text-zinc-700 hover:bg-zinc-100 ${className}`}
    >
      <PenLine className="size-3 shrink-0" aria-hidden="true" />
      <span>{TEAM_WRITTEN_LABEL}</span>
    </Link>
  );
}
