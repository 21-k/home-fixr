import type {
  AuthorLite,
  CollabType,
  PostType,
  TradeType,
} from "@/lib/types";

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const TRADE_LABELS: Record<TradeType, string> = {
  plumbing: "Plumbing",
  hvac: "HVAC",
  electrical: "Electrical",
  other: "General",
};

export function tradeLabel(trade: TradeType | null): string {
  return trade ? TRADE_LABELS[trade] : "General";
}

/** A one-line headline like "Master Plumber · 28 yrs · Newark, NJ". */
export function profileHeadline(p: AuthorLite): string {
  const title = p.title ?? tradeLabel(p.trade);
  const parts = [title];
  if (p.years_experience != null) parts.push(`${p.years_experience} yrs`);
  if (p.region) parts.push(p.region);
  return parts.join(" · ");
}

export const POST_TYPE_LABEL: Record<PostType, string> = {
  question: "Question",
  tip: "Tip from a pro",
  discussion: "Discussion",
};

export const COLLAB_TYPE_LABEL: Record<CollabType, string> = {
  extra_hand: "Extra hand",
  ride_along: "Junior ride-along",
  specialist: "Specialist",
};
