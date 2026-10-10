// "Position filled" rules for ride-alongs and collaborations (job_collabs,
// migration 0013), kept pure so the board, My opportunities, the server
// actions and the tests all agree.

export const COLLAB_FILLED_LABEL = "Position filled";

export const COLLAB_FILLED_MESSAGE =
  "This position has been filled, so it isn't taking applications.";

/** The board's empty state: nothing posted, or nothing open under "Open only". */
export const COLLABS_EMPTY_MESSAGE =
  "No active opportunities available. Mentors can post a ride-along or collaboration; apprentices can browse when opportunities become available.";

type Fillable = { filled_at: string | null };

export function isCollabFilled(c: Fillable | null | undefined): boolean {
  return Boolean(c?.filled_at);
}

/**
 * Open collabs first, then filled ones. Inside each group the incoming order
 * is kept (the query already sorts newest first), so this is a stable split.
 */
export function sortCollabsOpenFirst<T extends Fillable>(list: readonly T[]): T[] {
  return [
    ...list.filter((c) => !isCollabFilled(c)),
    ...list.filter((c) => isCollabFilled(c)),
  ];
}

/** `?status=open` → open only. Anything else (or nothing) → all, open first. */
export type CollabStatusFilter = "all" | "open";

export function parseCollabStatusFilter(raw: string | string[] | undefined): CollabStatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "open" ? "open" : "all";
}

/** The /collabs URL for a type + status filter combination. */
export function collabsHref({
  type,
  status,
}: {
  type?: string | null;
  status?: CollabStatusFilter;
}): string {
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (status === "open") q.set("status", "open");
  const s = q.toString();
  return s ? `/collabs?${s}` : "/collabs";
}

/**
 * Why the apply / "I'm interested" control is hidden for this viewer, or null
 * when they can apply. Order matters: the poster always gets their own
 * controls; a filled job reads "Position filled" even when it's a Founding
 * Community posting (which also can't take applications).
 */
export type ApplyBlock = "own" | "filled" | "founding" | null;

export function applyBlockReason({
  isOwnPosting,
  filled,
  posterIsFounding,
}: {
  isOwnPosting: boolean;
  filled: boolean;
  posterIsFounding: boolean;
}): ApplyBlock {
  if (isOwnPosting) return "own";
  if (filled) return "filled";
  if (posterIsFounding) return "founding";
  return null;
}

/**
 * The poster just accepted someone and the job is still open: offer to mark
 * it filled. Filling stays a manual step (a poster may want two people).
 */
export function shouldOfferMarkFilled(
  collab: Fillable,
  applicantStatuses: readonly string[],
): boolean {
  return !isCollabFilled(collab) && applicantStatuses.includes("accepted");
}
