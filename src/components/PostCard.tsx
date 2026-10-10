import Link from "next/link";
import { MessageSquare, Star } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { UserName } from "@/components/UserName";
import { POST_TYPE_LABEL, profileHeadline, timeAgo } from "@/lib/format";
import type { AuthorLite, Post } from "@/lib/types";

const TAG_STYLES = {
  question: "bg-info-bg text-info-fg",
  tip: "bg-success-bg text-success-fg",
  discussion: "bg-brand-50 text-brand-700",
} as const;

export function PostCard({
  post,
  author,
}: {
  post: Post;
  author: AuthorLite | null;
}) {
  return (
    <article data-testid="post-card" className="border-b border-zinc-200 py-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar
          person={author}
          size="md"
          href={author ? `/u/${author.username}` : undefined}
        />
        <div className="text-[13px] text-zinc-600">
          <UserName person={author} />
          {author && ` · ${profileHeadline(author)}`}
          {" · "}
          {timeAgo(post.created_at)}
        </div>
        <span
          className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${TAG_STYLES[post.type]}`}
        >
          {POST_TYPE_LABEL[post.type]}
        </span>
      </div>


      <Link href={`/q/${post.slug ?? post.id}`} className="group block">
        <h3 className="font-semibold leading-snug wrap-anywhere group-hover:text-brand-600">
          {post.title}
        </h3>
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-zinc-700 wrap-anywhere">
          {post.body}
        </p>
      </Link>

      <div className="mt-2 flex gap-4 text-[13px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="size-3.5" /> {post.reply_count}{" "}
          {post.reply_count === 1 ? "reply" : "replies"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Star className="size-3.5" /> {post.helpful_count} helpful
        </span>
      </div>
    </article>
  );
}
