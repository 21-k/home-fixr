import type {
  AuthorLite,
  CollabType,
  MentorAvailability,
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

/** "1 year", "2 years", "28 years" (0 reads "Less than 1 year"). */
export function yearsLabel(n: number): string {
  if (n <= 0) return "Less than 1 year";
  return n === 1 ? "1 year" : `${n} years`;
}

/** Interface names for the two roles. The DB values stay junior / senior. */
export const ROLE_LABEL = {
  junior: "Apprentice",
  senior: "Mentor",
} as const;

/** A one-line headline like "Master Plumber · 28 years · Newark, NJ". */
export function profileHeadline(p: AuthorLite): string {
  const title = p.title ?? tradeLabel(p.trade);
  const parts = [title];
  if (p.years_experience != null) parts.push(yearsLabel(p.years_experience));
  if (p.region) parts.push(p.region);
  return parts.join(" · ");
}

export const POST_TYPE_LABEL: Record<PostType, string> = {
  question: "Question",
  tip: "Tip from a pro",
  discussion: "Discussion",
};

export const AVAILABILITY_LABEL: Record<MentorAvailability, string> = {
  accepting: "Accepting mentorship requests",
  limited: "Limited availability",
  not_accepting: "Not accepting mentorship requests",
};

/** The section name for /collabs (the URL and DB names stay "collabs"). */
export const COLLABS_TITLE = "Ride-alongs and collaborations";
/** Short form for the top nav. */
export const COLLABS_NAV = "Ride-alongs";

/** Shown under the mentor directory title and on profiles. */
export const SELF_REPORTED_NOTE =
  "Licenses, credentials and experience are self-reported by members and not verified by Home Fixr.";

export const COLLAB_TYPE_LABEL: Record<CollabType, string> = {
  extra_hand: "Extra hand",
  ride_along: "Apprentice ride-along",
  specialist: "Specialist",
};
