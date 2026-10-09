import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Handshake, Home, Users } from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { TradeIcon } from "@/components/icons";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { ProfilePrompt } from "@/components/ProfilePrompt";
import { getCurrentProfile } from "@/lib/auth/session";
import { loginHref } from "@/lib/next-path";
import { COLLABS_NAV, profileHeadline } from "@/lib/format";
import { UserName } from "@/components/UserName";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, Post, Profile, TradeType } from "@/lib/types";

const TRADE_FILTERS: { key: TradeType; label: string }[] = [
  { key: "electrical", label: "Electrical" },
  { key: "plumbing", label: "Plumbing" },
  { key: "hvac", label: "HVAC" },
];

// Plain searches, not trending claims: each opens /search for its topic.
const TOPICS: { label: string; q: string }[] = [
  { label: "Permits and inspections", q: "permit" },
  { label: "Pricing a service call", q: "service call" },
  { label: "Mini-split installs", q: "mini-split" },
];

type PostWithAuthor = Post & { author: AuthorLite | null };

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string }>;
}) {
  const { trade } = await searchParams;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
    .order("created_at", { ascending: false });
  if (trade) query = query.eq("trade", trade);

  const { data, error } = await query;
  const posts = (data ?? []) as unknown as PostWithAuthor[];

  const connections = await loadConnections(profile);

  const sidebar = (
    <nav>
      <SideSection>My Feed</SideSection>
      <SideLink href="/feed" active={!trade}>
        <Home className="size-4" /> Home
      </SideLink>
      <SideSection>My Trades</SideSection>
      {TRADE_FILTERS.map((t) => (
        <SideLink key={t.key} href={`/feed?trade=${t.key}`} active={trade === t.key}>
          <TradeIcon trade={t.key} /> {t.label}
        </SideLink>
      ))}
      <SideSection>Community</SideSection>
      <SideLink href="/mentors">
        <Users className="size-4" /> Mentors
      </SideLink>
      <SideLink href="/mentorships">
        <Handshake className="size-4" /> My mentorships
      </SideLink>
      <SideLink href="/collabs">
        <Briefcase className="size-4" /> {COLLABS_NAV}
      </SideLink>
    </nav>
  );

  const right = (
    <div>
      <Link
        href={profile ? "/mentorships" : "/mentors"}
        className="mb-3 block text-[13px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-brand-600"
      >
        {!profile ? "Explore mentors" : profile.role === "senior" ? "Your mentees" : "Your mentors"} →
      </Link>
      {connections.length === 0 ? (
        <p className="mb-6 text-[13px] text-zinc-500">
          {profile ? (
            <>
              No connections yet.{" "}
              <Link href="/mentors" className="font-medium text-brand-600 hover:underline">
                Find a mentor
              </Link>{" "}
              to get started.
            </>
          ) : (
            <Link href="/mentors" className="font-medium text-brand-600 hover:underline">
              Browse the mentor directory
            </Link>
          )}
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-1">
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-zinc-50"
            >
              <Avatar person={c} size="sm" href={`/u/${c.username}`} />
              <div>
                <div className="text-sm">
                  <UserName person={c} />
                </div>
                <div className="text-xs text-zinc-600">{profileHeadline(c)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
        Topics to explore
      </h4>
      <div className="flex flex-col gap-2.5 text-[13px] leading-5 text-zinc-700">
        {TOPICS.map((t) => (
          <Link
            key={t.q}
            href={`/search?q=${encodeURIComponent(t.q)}`}
            className="text-left hover:text-brand-600 hover:underline"
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <AppBody sidebar={sidebar} mobileLabel="Trades & community" right={right}>
      <h1 className="sr-only">
        {trade ? `${TRADE_FILTERS.find((t) => t.key === trade)?.label ?? "Trade"} feed` : "Community feed"}
      </h1>
      {profile && <ProfilePrompt profile={profile} />}
      {profile ? (
        <PostComposer me={profile} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <Link href="/join" className="font-medium text-brand-600 hover:underline">
            Join the community
          </Link>{" "}
          or{" "}
          <Link href={loginHref("/feed")} className="font-medium text-brand-600 hover:underline">
            sign in
          </Link>{" "}
          to ask a question in the community.
        </div>
      )}

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-5 py-2">
        {error ? (
          <p className="py-6 text-sm text-red-700">
            Couldn&apos;t load the feed: {error.message}
          </p>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No posts yet{trade ? " for this trade" : ""}. Be the first to post.
          </p>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} author={post.author} />
          ))
        )}
      </div>
    </AppBody>
  );
}

/** Active mentorship counterparts for the current user (mentors or mentees). */
async function loadConnections(profile: Profile | null): Promise<AuthorLite[]> {
  const supabase = await createClient();

  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select(AUTHOR_COLS)
      .eq("role", "senior")
      .limit(3);
    return (data ?? []) as AuthorLite[];
  }

  const { data: rows } = await supabase
    .from("mentorships")
    .select("junior_id, senior_id")
    .eq("status", "active")
    .or(`junior_id.eq.${profile.id},senior_id.eq.${profile.id}`);

  const counterpartIds = (rows ?? []).map((r) =>
    r.junior_id === profile.id ? r.senior_id : r.junior_id,
  );
  if (counterpartIds.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select(AUTHOR_COLS)
    .in("id", counterpartIds);
  return (data ?? []) as AuthorLite[];
}
