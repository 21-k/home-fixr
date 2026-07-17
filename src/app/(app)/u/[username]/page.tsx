import Link from "next/link";
import { notFound } from "next/navigation";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Star } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { MentorshipButton } from "@/components/MentorshipButton";
import { PostCard } from "@/components/PostCard";
import { ToastButton } from "@/components/ToastButton";
import { getCurrentProfile } from "@/lib/auth/session";
import { profileHeadline, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, MentorshipStatus, Post, Profile } from "@/lib/types";

const AUTHOR_COLS =
  "id, username, full_name, avatar_initials, title, role, trade, region, years_experience";

type ReplyWithPost = {
  id: string;
  body: string;
  is_accepted: boolean;
  helpful_count: number;
  created_at: string;
  post: { id: string; title: string } | null;
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!profileData) notFound();
  const profile = profileData as Profile;

  // Mentorship state between the viewer (as junior) and this senior.
  const viewer = await getCurrentProfile();
  const canRequestMentorship =
    !!viewer && viewer.id !== profile.id && profile.role === "senior";
  let mentorshipStatus: MentorshipStatus | null = null;
  if (canRequestMentorship) {
    const { data: m } = await supabase
      .from("mentorships")
      .select("status")
      .eq("junior_id", viewer!.id)
      .eq("senior_id", profile.id)
      .maybeSingle();
    mentorshipStatus = (m?.status as MentorshipStatus) ?? null;
  }

  // Follow state + follower count. The follows table lands in migrations/0002;
  // Supabase returns an error (not a throw) if it's missing, so these safely
  // degrade to false/0 until you run that migration.
  let isFollowing = false;
  if (viewer && viewer.id !== profile.id) {
    const { data: f } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", viewer.id)
      .eq("following_id", profile.id)
      .maybeSingle();
    isFollowing = !!f;
  }
  const { count: followerCountRaw } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", profile.id);
  const followerCount = followerCountRaw ?? 0;

  const [{ data: postsData }, { data: repliesData }, { count: menteeCount }, { count: collabCount }, { count: answeredCount }] =
    await Promise.all([
      supabase
        .from("posts")
        .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("replies")
        .select("id, body, is_accepted, helpful_count, created_at, post:posts ( id, title )")
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("mentorships")
        .select("*", { count: "exact", head: true })
        .eq("senior_id", profile.id)
        .eq("status", "active"),
      supabase
        .from("job_collabs")
        .select("*", { count: "exact", head: true })
        .eq("poster_id", profile.id),
      supabase
        .from("replies")
        .select("*", { count: "exact", head: true })
        .eq("author_id", profile.id),
    ]);

  const posts = (postsData ?? []) as unknown as (Post & { author: AuthorLite | null })[];
  const answers = (repliesData ?? []) as unknown as ReplyWithPost[];

  const sidebar = (
    <nav>
      <SideSection>Back</SideSection>
      <Link href="/mentors">
        <SideLink>← All mentors</SideLink>
      </Link>
      <Link href="/feed">
        <SideLink>← Back to feed</SideLink>
      </Link>
    </nav>
  );

  return (
    <AppBody sidebar={sidebar}>
      <section className="mb-4 flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:flex-row">
        <Avatar initials={profile.avatar_initials} size="xl" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.full_name}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-600">{profileHeadline(profile)}</p>
          {profile.bio && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">
              {profile.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!viewer ? (
              <Link
                href="/login"
                className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                Sign in to connect
              </Link>
            ) : viewer.id === profile.id ? (
              <Link
                href="/settings"
                className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                Edit profile
              </Link>
            ) : (
              <>
                {canRequestMentorship && (
                  <MentorshipButton
                    seniorId={profile.id}
                    username={profile.username}
                    status={mentorshipStatus}
                  />
                )}
                <FollowButton
                  profileId={profile.id}
                  username={profile.username}
                  isFollowing={isFollowing}
                />
                <Link
                  href={`/messages/${profile.username}`}
                  className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100"
                >
                  Send a message
                </Link>
                {profile.is_open_to_ride_alongs && (
                  <ToastButton
                    variant="secondary"
                    label="Ask to ride along"
                    message="Ride-along requests aren't wired up yet."
                  />
                )}
              </>
            )}
          </div>

          <dl className="mt-5 flex flex-wrap gap-8 border-t border-zinc-200 pt-4">
            <Stat value={answeredCount ?? 0} label="answers" />
            <Stat value={followerCount} label="followers" />
            <Stat value={menteeCount ?? 0} label="active mentees" />
            <Stat value={collabCount ?? 0} label="collabs posted" />
          </dl>
        </div>
      </section>

      {answers.length > 0 && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">
            Recent answers from {profile.full_name.split(" ")[0]}
          </h2>
          {answers.map((a) => (
            <div key={a.id} className="border-b border-zinc-200 py-3 last:border-b-0">
              <div className="mb-1 flex items-center gap-2 text-[13px] text-zinc-600">
                <span>
                  Replied to{" "}
                  {a.post ? (
                    <Link
                      href={`/q/${a.post.id}`}
                      className="font-medium text-zinc-900 hover:text-brand-500"
                    >
                      “{a.post.title}”
                    </Link>
                  ) : (
                    "a post"
                  )}
                </span>
                {a.is_accepted && (
                  <span className="rounded bg-success-bg px-2 py-0.5 text-xs font-medium text-success-fg">
                    ✓ Accepted answer
                  </span>
                )}
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-zinc-700">
                {a.body}
              </p>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <Star className="size-3" /> {a.helpful_count} helpful ·{" "}
                {timeAgo(a.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white px-5 py-2">
        <h2 className="py-3 font-semibold">Posts from {profile.full_name.split(" ")[0]}</h2>
        {posts.length === 0 ? (
          <p className="py-6 text-sm text-zinc-500">No posts yet.</p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} author={p.author} />)
        )}
      </div>
    </AppBody>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="text-xl font-semibold text-zinc-900">{value}</dt>
      <dd className="text-[13px] text-zinc-600">{label}</dd>
    </div>
  );
}
