import { createClient } from "@/lib/supabase/server";

// Shapes we read from Supabase. `author` is embedded from the profiles table
// via the posts.author_id foreign key.
type Author = {
  full_name: string;
  avatar_initials: string;
  role: "junior" | "senior";
  trade: string | null;
  region: string | null;
};

type Post = {
  id: string;
  type: "question" | "tip" | "discussion";
  title: string;
  body: string;
  trade: string | null;
  region: string | null;
  helpful_count: number;
  reply_count: number;
  created_at: string;
  author: Author | null;
};

const TYPE_STYLES: Record<Post["type"], string> = {
  question: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  tip: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  discussion:
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select(
      `id, type, title, body, trade, region, helpful_count, reply_count, created_at,
       author:profiles ( full_name, avatar_initials, role, trade, region )`,
    )
    .order("created_at", { ascending: false });

  const posts = (data ?? []) as unknown as Post[];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">Home Fixr</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Where senior tradespeople mentor the next generation.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Couldn’t load the feed.</p>
          <p className="mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-sm font-medium">No posts yet.</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Run <code className="font-mono">supabase/seed.sql</code> to add
            sample data, or be the first to post.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li
              key={post.id}
              className="rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {post.author?.avatar_initials ?? "??"}
                </span>
                <div className="min-w-0 text-sm">
                  <span className="font-medium">
                    {post.author?.full_name ?? "Unknown"}
                  </span>
                  {post.author?.role === "senior" && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Mentor
                    </span>
                  )}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" · "}
                    {[post.author?.trade, post.author?.region]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TYPE_STYLES[post.type]}`}
                >
                  {post.type}
                </span>
                <span className="text-xs text-zinc-400">
                  {timeAgo(post.created_at)}
                </span>
              </div>

              <h2 className="mt-2 font-semibold leading-snug">{post.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {post.body}
              </p>

              <div className="mt-4 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span>👍 {post.helpful_count} helpful</span>
                <span>💬 {post.reply_count} replies</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
