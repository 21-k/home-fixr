import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { ReplyComposer } from "@/components/ReplyComposer";
import { RichText } from "@/components/RichText";
import { UserName } from "@/components/UserName";
import {
  acceptReply,
  deletePost,
  deleteReply,
  markPostHelpful,
  markReplyHelpful,
} from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { loginHref } from "@/lib/next-path";
import { POST_TYPE_LABEL, profileHeadline, timeAgo, tradeLabel } from "@/lib/format";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, Post, Reply } from "@/lib/types";

type ReplyWithAuthor = Reply & { author: AuthorLite | null };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  // Look up by slug; fall back to id so old /q/<uuid> links (and pre-slug data)
  // still resolve.
  let { data: postData } = await supabase
    .from("posts")
    .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
    .eq("slug", slug)
    .maybeSingle();
  if (!postData && UUID_RE.test(slug)) {
    ({ data: postData } = await supabase
      .from("posts")
      .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
      .eq("id", slug)
      .maybeSingle());
  }

  if (!postData) notFound();
  const post = postData as unknown as Post & { author: AuthorLite | null };

  const { data: repliesData } = await supabase
    .from("replies")
    .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
    .eq("post_id", post.id)
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
      <SideLink>
        <Star className="size-4" /> {post.helpful_count} helpful
      </SideLink>
      <SideSection>Back</SideSection>
      <SideLink href="/feed">← Back to feed</SideLink>
    </nav>
  );

  return (
    <AppBody sidebar={sidebar} mobileLabel="Thread">
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
          <UserName
            person={post.author}
            className="font-medium text-zinc-900 hover:text-brand-500"
          />{" "}
          · {timeAgo(post.created_at)}
        </p>
        <RichText
          text={post.body}
          className="whitespace-pre-line text-sm leading-relaxed text-zinc-700"
        />
        {profile && (
          <div className="mt-4 flex items-center gap-2">
            <form action={markPostHelpful}>
              <input type="hidden" name="post_id" value={post.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
              >
                <Star className="size-3.5" /> Helpful ({post.helpful_count})
              </button>
            </form>
            {isOwner && (
              <form action={deletePost}>
                <input type="hidden" name="post_id" value={post.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </form>
            )}
          </div>
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
                person={reply.author}
                size="md"
                href={reply.author ? `/u/${reply.author.username}` : undefined}
              />
              <div>
                <UserName
                  person={reply.author}
                  className="text-sm font-semibold hover:text-brand-500"
                />
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
            <RichText
              text={reply.body}
              className="whitespace-pre-line text-sm leading-relaxed text-zinc-700"
            />
            <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-3.5" /> {reply.helpful_count} helpful ·{" "}
                {timeAgo(reply.created_at)}
              </span>
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
              {profile?.id === reply.author_id && (
                <form action={deleteReply}>
                  <input type="hidden" name="reply_id" value={reply.id} />
                  <input type="hidden" name="post_id" value={post.id} />
                  <button type="submit" className="font-medium text-red-600 hover:underline">
                    Delete
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
          <Link
            href={loginHref(`/q/${post.slug ?? post.id}`)}
            className="font-medium text-brand-600 hover:underline"
          >
            Sign in
          </Link>{" "}
          to add your reply.
        </div>
      )}
    </AppBody>
  );
}
