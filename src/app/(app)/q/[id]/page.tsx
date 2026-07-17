import Link from "next/link";
import { notFound } from "next/navigation";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { ReplyComposer } from "@/components/ReplyComposer";
import { acceptReply, markPostHelpful, markReplyHelpful } from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { POST_TYPE_LABEL, profileHeadline, timeAgo, tradeLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, Post, Reply } from "@/lib/types";

const AUTHOR_COLS =
  "id, username, full_name, avatar_initials, title, role, trade, region, years_experience";

type ReplyWithAuthor = Reply & { author: AuthorLite | null };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: postData } = await supabase
    .from("posts")
    .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
    .eq("id", id)
    .maybeSingle();

  if (!postData) notFound();
  const post = postData as unknown as Post & { author: AuthorLite | null };

  const { data: repliesData } = await supabase
    .from("replies")
    .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
    .eq("post_id", id)
    .order("is_accepted", { ascending: false })
    .order("helpful_count", { ascending: false })
    .order("created_at", { ascending: true });
  const replies = (repliesData ?? []) as unknown as ReplyWithAuthor[];

  const isOwner = profile?.id === post.author_id;

  const sidebar = (
    <nav>
      <SideSection>Thread</SideSection>
      <SideLink active>Question</SideLink>
      <SideLink>{post.reply_count} replies</SideLink>
      <SideLink>⭐ {post.helpful_count} helpful</SideLink>
      <SideSection>Back</SideSection>
      <Link href="/feed">
        <SideLink>← Back to feed</SideLink>
      </Link>
    </nav>
  );

  return (
    <AppBody sidebar={sidebar}>
      <article className="mb-4 rounded-xl border border-zinc-200 bg-white p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {POST_TYPE_LABEL[post.type]}
          </span>
          {post.trade && (
            <span className="text-[13px] text-zinc-500">{tradeLabel(post.trade)}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-2 mb-4 text-[13px] text-zinc-600">
          Asked by{" "}
          <Link
            href={post.author ? `/u/${post.author.username}` : "#"}
            className="font-medium text-zinc-900 hover:text-brand-500"
          >
            {post.author?.full_name ?? "Unknown"}
          </Link>{" "}
          · {timeAgo(post.created_at)}
        </p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
          {post.body}
        </p>
        {profile && (
          <form action={markPostHelpful} className="mt-4">
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
            >
              ⭐ Helpful ({post.helpful_count})
            </button>
          </form>
        )}
      </article>

      <div className="mb-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-500">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        {replies.map((reply) => (
          <div
            key={reply.id}
            className={`rounded-xl border p-5 ${
              reply.is_accepted
                ? "border-success-fg bg-success-bg"
                : "border-zinc-200 bg-white"
            }`}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar
                initials={reply.author?.avatar_initials ?? "??"}
                size="md"
                href={reply.author ? `/u/${reply.author.username}` : undefined}
              />
              <div>
                <Link
                  href={reply.author ? `/u/${reply.author.username}` : "#"}
                  className="text-sm font-semibold hover:text-brand-500"
                >
                  {reply.author?.full_name ?? "Unknown"}
                </Link>
                <div className="text-xs text-zinc-600">
                  {reply.author ? profileHeadline(reply.author) : ""}
                </div>
              </div>
              {reply.author?.role === "senior" && (
                <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                  Senior pro
                </span>
              )}
              {reply.is_accepted && (
                <span className="ml-auto rounded bg-success-fg px-2 py-0.5 text-xs font-medium text-white">
                  ✓ Accepted answer
                </span>
              )}
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
              {reply.body}
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
              <span>⭐ {reply.helpful_count} helpful · {timeAgo(reply.created_at)}</span>
              {profile && (
                <form action={markReplyHelpful}>
                  <input type="hidden" name="reply_id" value={reply.id} />
                  <input type="hidden" name="post_id" value={post.id} />
                  <button type="submit" className="font-medium text-brand-600 hover:underline">
                    Mark helpful
                  </button>
                </form>
              )}
              {isOwner && !reply.is_accepted && (
                <form action={acceptReply}>
                  <input type="hidden" name="reply_id" value={reply.id} />
                  <input type="hidden" name="post_id" value={post.id} />
                  <button type="submit" className="font-medium text-success-fg hover:underline">
                    ✓ Accept this answer
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            No replies yet. Be the first to help.
          </p>
        )}
      </div>

      {profile ? (
        <ReplyComposer postId={post.id} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>{" "}
          to add your reply.
        </div>
      )}
    </AppBody>
  );
}
