import type { Metadata } from "next";
import Link from "next/link";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { FoundingBadge } from "@/components/FoundingBadge";
import { TradeIcon } from "@/components/icons";
import { displayName } from "@/lib/display";
import { AVAILABILITY_LABEL, profileHeadline } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TradeType } from "@/lib/types";

const TRADES: { key: TradeType; label: string }[] = [
  { key: "electrical", label: "Electrical" },
  { key: "plumbing", label: "Plumbing" },
  { key: "hvac", label: "HVAC" },
];

// Region values match the ", NJ"/", NY" suffix stored on profiles via ilike.
const REGIONS: { label: string; value: string }[] = [
  { label: "New Jersey", value: "NJ" },
  { label: "New York", value: "NY" },
  { label: "Pennsylvania", value: "PA" },
];

type Search = { trade?: string; region?: string; avail?: string };

function buildHref(current: Search, patch: Search): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/mentors?${qs}` : "/mentors";
}

export const metadata: Metadata = { title: "Mentors" };

export default async function MentorsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("profiles").select("*").eq("role", "senior");
  if (sp.trade) query = query.eq("trade", sp.trade);
  if (sp.region) query = query.ilike("region", `%${sp.region}%`);
  if (sp.avail === "messages") query = query.eq("is_open_to_messages", true);
  if (sp.avail === "ride_alongs") query = query.eq("is_open_to_ride_alongs", true);
  // "Accepting mentees" only lists mentors a real person will answer for:
  // Founding Community accounts never qualify (plan §4 / §6).
  if (sp.avail === "accepting")
    query = query.eq("mentor_availability", "accepting").eq("is_founding_member", false);

  const { data } = await query.order("years_experience", {
    ascending: false,
    nullsFirst: false,
  });
  const mentors = (data ?? []) as Profile[];

  // Real "mentees" counts, tallied from active mentorships in one query.
  const { data: mentorships } = await supabase
    .from("mentorships")
    .select("senior_id")
    .eq("status", "active");
  const menteeCount = new Map<string, number>();
  for (const m of mentorships ?? [])
    menteeCount.set(m.senior_id, (menteeCount.get(m.senior_id) ?? 0) + 1);

  // Real "answered" counts, tallied from replies in one query.
  const { data: replies } = await supabase.from("replies").select("author_id");
  const answeredCount = new Map<string, number>();
  for (const r of replies ?? [])
    answeredCount.set(r.author_id, (answeredCount.get(r.author_id) ?? 0) + 1);

  const sidebar = (
    <nav>
      <SideSection>Filter</SideSection>
      <SideLink href={buildHref(sp, { trade: undefined })} active={!sp.trade}>All trades</SideLink>
      {TRADES.map((t) => (
        <SideLink key={t.key} href={buildHref(sp, { trade: t.key })} active={sp.trade === t.key}>
          <TradeIcon trade={t.key} /> {t.label}
        </SideLink>
      ))}
      <SideSection>Region</SideSection>
      <SideLink href={buildHref(sp, { region: undefined })} active={!sp.region}>All regions</SideLink>
      {REGIONS.map((r) => (
        <SideLink key={r.value} href={buildHref(sp, { region: r.value })} active={sp.region === r.value}>{r.label}</SideLink>
      ))}
      <SideSection>Availability</SideSection>
      <SideLink href={buildHref(sp, { avail: sp.avail === "accepting" ? undefined : "accepting" })} active={sp.avail === "accepting"}>Accepting mentees</SideLink>
      <SideLink href={buildHref(sp, { avail: sp.avail === "messages" ? undefined : "messages" })} active={sp.avail === "messages"}>Open to messages</SideLink>
      <SideLink href={buildHref(sp, { avail: sp.avail === "ride_alongs" ? undefined : "ride_alongs" })} active={sp.avail === "ride_alongs"}>Open to ride-alongs</SideLink>
    </nav>
  );

  return (
    <AppBody sidebar={sidebar} mobileLabel="Filter mentors">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Senior pros in the community</h1>
        <span className="text-[13px] text-zinc-500">
          Showing {mentors.length} mentor{mentors.length === 1 ? "" : "s"}
        </span>
      </div>

      {mentors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No mentors match these filters yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mentors.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-brand-500 hover:shadow-[0_2px_8px_rgba(140,93,225,0.12)]"
            >
              <Link href={`/u/${m.username}`} className="block">
                <div className="mb-3 flex gap-3.5">
                  <Avatar person={m} size="lg" />
                  <div>
                    <p className="font-semibold">{displayName(m)}</p>
                    <p className="mt-0.5 text-[13px] text-zinc-600">
                      {profileHeadline(m)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {AVAILABILITY_LABEL[m.mentor_availability]}
                    </p>
                  </div>
                </div>
                {m.bio && (
                  <p className="mb-3 line-clamp-3 text-[13px] leading-5 text-zinc-700 wrap-anywhere">
                    {m.bio}
                  </p>
                )}
              </Link>
              <div className="flex items-center justify-between">
                <div className="flex gap-3.5 text-xs text-zinc-600">
                  <span>
                    <strong className="text-zinc-900">
                      {answeredCount.get(m.id) ?? 0}
                    </strong>{" "}
                    answered
                  </span>
                  <span>
                    <strong className="text-zinc-900">
                      {menteeCount.get(m.id) ?? 0}
                    </strong>{" "}
                    mentees
                  </span>
                </div>
                {m.is_founding_member ? (
                  <FoundingBadge />
                ) : (
                  <Link
                    href={`/messages/${m.username}`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
                  >
                    Message
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppBody>
  );
}
