import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { UserName } from "@/components/UserName";
import { profileHeadline } from "@/lib/format";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, Post, Profile } from "@/lib/types";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  // Strip characters that would break PostgREST's .or() filter grammar.
  const safe = q.replace(/[,()%*]/g, " ").trim();

  const supabase = await createClient();
  let posts: (Post & { author: AuthorLite | null })[] = [];
  let people: Profile[] = [];

  if (safe) {
    const [{ data: postData }, { data: peopleData }] = await Promise.all([
      supabase
        .from("posts")
        .select(`*, author:profiles ( ${AUTHOR_COLS} )`)
        .or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("profiles")
        .select("*")
        // Members are found by handle, not by their (private) full name.
        .or(`username.ilike.%${safe}%,bio.ilike.%${safe}%,title.ilike.%${safe}%`)
        .limit(20),
    ]);
    posts = (postData ?? []) as unknown as (Post & { author: AuthorLite | null })[];
    people = (peopleData ?? []) as Profile[];
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">
        {q ? `Results for “${q}”` : "Search"}
      </h1>
      <p className="mb-4 text-[13px] text-zinc-600">
        Search posts and members across the community.
      </p>
      {/* Its own box: on phones the header's search lives behind the menu. */}
      <form action="/search" role="search" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search posts and members"
          placeholder="Search posts & members…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-200"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Search
        </button>
      </form>

      {!q ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Search for a topic, a tool, or a member&apos;s handle.
        </p>
      ) : (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">
              People ({people.length})
            </h2>
            {people.length === 0 ? (
              <p className="text-sm text-zinc-500">No members matched.</p>
            ) : (
              <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-2">
                {people.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-zinc-50"
                  >
                    <Avatar person={p} size="md" href={`/u/${p.username}`} />
                    <div>
                      <div className="text-sm">
                        <UserName person={p} />{" "}
                        <span className="text-xs text-zinc-500">@{p.username}</span>
                      </div>
                      <div className="text-xs text-zinc-600">{profileHeadline(p)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">
              Posts ({posts.length})
            </h2>
            {posts.length === 0 ? (
              <p className="text-sm text-zinc-500">No posts matched.</p>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-white px-5 py-2">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} author={p.author} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
