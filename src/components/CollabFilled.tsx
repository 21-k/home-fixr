import { CheckCircle2, RotateCcw } from "lucide-react";
import { setCollabFilled } from "@/lib/actions";
import { COLLAB_FILLED_LABEL } from "@/lib/collabs";

/** The "Position filled" badge on a collab card (migration 0013). */
export function CollabFilledBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="collab-filled-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 ${className}`}
    >
      <CheckCircle2 className="size-3.5" />
      {COLLAB_FILLED_LABEL}
    </span>
  );
}

/**
 * Mark filled / Reopen, for the poster only (the action and RLS both check
 * ownership). Plain form + server action, so it works without JS and from
 * both server and client components.
 */
export function CollabFilledToggle({
  collabId,
  filled,
  emphasis = false,
}: {
  collabId: string;
  filled: boolean;
  /** Primary styling, used right after the poster accepts someone. */
  emphasis?: boolean;
}) {
  return (
    <form action={setCollabFilled}>
      <input type="hidden" name="collab_id" value={collabId} />
      <input type="hidden" name="filled" value={filled ? "false" : "true"} />
      {filled ? (
        <button
          data-testid="collab-reopen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
        >
          <RotateCcw className="size-3.5" /> Reopen
        </button>
      ) : (
        <button
          data-testid="collab-mark-filled"
          className={
            emphasis
              ? "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
              : "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
          }
        >
          <CheckCircle2 className="size-3.5" /> Mark as filled
        </button>
      )}
    </form>
  );
}
