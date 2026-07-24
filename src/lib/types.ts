// Database types mirroring supabase/schema.sql.

export type UserRole = "junior" | "senior";
export type TradeType = "plumbing" | "hvac" | "electrical" | "other";
export type PostType = "question" | "tip" | "discussion";
export type CollabType = "extra_hand" | "ride_along" | "specialist";
export type MentorshipStatus = "pending" | "active" | "declined";
export type CollabInterestStatus = "interested" | "accepted" | "declined";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
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
  created_at: string;
};

// A short profile shape used when embedding an author into another row.
export type AuthorLite = Pick<
  Profile,
  "id" | "username" | "full_name" | "avatar_initials" | "title" | "role" | "trade" | "region" | "years_experience"
>;
