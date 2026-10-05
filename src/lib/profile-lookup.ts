import type { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape LIKE wildcards; handles may contain "_" which LIKE treats as "any". */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Resolve /u/<x> (and /messages/<x>) to a profile. Handles are unique
 * case-insensitively, so /u/raritansparky finds RaritanSparky; a profile id is
 * also accepted for old id-based links. The caller should redirect when
 * `profile.username !== x` so every profile has one canonical URL.
 */
export async function findProfileByHandle(
  supabase: SupabaseServer,
  handleOrId: string,
): Promise<Profile | null> {
  const key = decodeURIComponent(handleOrId);

  const { data: exact } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", key)
    .maybeSingle();
  if (exact) return exact as Profile;

  if (/^[A-Za-z0-9_.]{1,40}$/.test(key)) {
    const { data: ci } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", likeLiteral(key))
      .limit(1)
      .maybeSingle();
    if (ci) return ci as Profile;
  }

  if (UUID_RE.test(key)) {
    const { data: byId } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", key)
      .maybeSingle();
    if (byId) return byId as Profile;
  }

  return null;
}
