// Database types mirroring supabase/schema.sql.
import type { AvatarIconKey, AvatarStyle } from "@/lib/avatar";

export type UserRole = "junior" | "senior";
export type TradeType = "plumbing" | "hvac" | "electrical" | "other";
export type PostType = "question" | "tip" | "discussion";
export type CollabType = "extra_hand" | "ride_along" | "specialist";
export type MentorshipStatus = "pending" | "active" | "declined";
export type CollabInterestStatus = "interested" | "accepted" | "declined";
/** How a member's name renders publicly (migration 0009). */
export type DisplayPreference = "handle" | "first_name_initial" | "full_name";
/** Whether a senior is taking mentorship requests (migration 0009). */
export type MentorAvailability = "accepting" | "limited" | "not_accepting";

/** Coarse age bands — see the privacy note in migration 0008. */
export type AgeRange =
  | "under_18"
  | "18_24"
  | "25_34"
  | "35_44"
  | "45_54"
  | "55_plus"
  | "undisclosed";

export type Profile = {
  id: string;
  /** The public handle (migration 0009 rules). Profiles live at /u/<username>. */
  username: string;
  /** Private by default — render names with displayName(), never this. */
  full_name: string;
  display_preference: DisplayPreference;
  /** Null = handle was auto-derived at signup and never chosen. */
  username_changed_at: string | null;
  /** Seeded by the Home Fixr team; shown with a "Founding Community" badge. */
  is_founding_member: boolean;
  mentor_availability: MentorAvailability;
  /** Avatar (migration 0011): initials | icon | none; icon key when style = icon. */
  avatar_style: AvatarStyle;
  avatar_icon: AvatarIconKey | null;
  avatar_initials: string;
  title: string | null;
  role: UserRole;
  trade: TradeType | null;
  region: string | null;
  bio: string | null;
  years_experience: number | null;
  is_open_to_messages: boolean;
  is_open_to_ride_alongs: boolean;
  /** Null until the /welcome step is finished or skipped (migration 0006). */
  onboarded_at: string | null;
  created_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  slug: string | null;
  type: PostType;
  title: string;
  body: string;
  trade: TradeType | null;
  region: string | null;
  helpful_count: number;
  reply_count: number;
  created_at: string;
};

export type Reply = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  is_accepted: boolean;
  helpful_count: number;
  created_at: string;
};

export type JobCollab = {
  id: string;
  poster_id: string;
  type: CollabType;
  title: string;
  body: string;
  trade: TradeType | null;
  location: string | null;
  scheduled_date: string | null;
  pay_type: string | null;
  interested_count: number;
  // When the poster marked the position filled (migration 0013); null = open.
  filled_at: string | null;
  created_at: string;
};

// One row per person who raised their hand on a collab (migration 0004).
export type CollabInterest = {
  id: string;
  collab_id: string;
  user_id: string;
  status: CollabInterestStatus;
  note: string | null;
  // Object key in the private `cvs` Storage bucket, plus the original
  // filename for display (migration 0005).
  cv_path: string | null;
  cv_name: string | null;
  // Application detail (migration 0008). All optional — the pitch is the only
  // thing we insist on.
  years_experience: number | null;
  graduation_year: number | null;
  age_range: AgeRange | null;
  skills: string[] | null;
  is_licensed: boolean | null;
  license_note: string | null;
  has_own_tools: boolean | null;
  has_transport: boolean | null;
  created_at: string;
};

// A short profile shape used when embedding an author into another row.
// Matches AUTHOR_COLS in src/lib/profile-cols.ts.
export type AuthorLite = Pick<
  Profile,
  | "id"
  | "username"
  | "full_name"
  | "display_preference"
  | "is_founding_member"
  | "mentor_availability"
  | "avatar_initials"
  | "avatar_style"
  | "avatar_icon"
  | "title"
  | "role"
  | "trade"
  | "region"
  | "years_experience"
>;
