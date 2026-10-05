import Link from "next/link";
import { Banknote, CalendarDays, ClipboardList, MapPin, Users } from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { CollabComposer } from "@/components/CollabComposer";
import { CollabIcon } from "@/components/icons";
import { CollabInterestControl } from "@/components/CollabInterestControl";
import { UserName } from "@/components/UserName";
import { getCurrentProfile } from "@/lib/auth/session";
import { COLLAB_TYPE_LABEL } from "@/lib/format";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { createClient } from "@/lib/supabase/server";
import type {
  AuthorLite,
  CollabInterest,
  CollabType,
  JobCollab,
} from "@/lib/types";


const TYPE_FILTERS: { key: CollabType; label: string }[] = [
  { key: "extra_hand", label: "Need an extra hand" },
  { key: "ride_along", label: "Junior ride-along" },
  { key: "specialist", label: "Need a specialist" },
];

const PAY_LABEL: Record<string, string> = {
  day_rate: "Day rate",
  unpaid: "Unpaid (experience)",
  trade: "Trade hours",
  flexible: "Paid or trade",
};

const TYPE_BADGE: Record<CollabType, string> = {
  extra_hand: "bg-success-bg text-success-fg",
  ride_along: "bg-brand-50 text-brand-700",
  specialist: "bg-info-bg text-info-fg",
};

type CollabWithPoster = JobCollab & { poster: AuthorLite | null };

export default async function CollabsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  let query = supabase
    .from("job_collabs")
    .select(`*, poster:profiles ( ${AUTHOR_COLS} )`)
    .order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);

  const { data } = await query;
  const collabs = (data ?? []) as unknown as CollabWithPoster[];

  // Which of these have I already applied to, and with what? RLS only returns
  // my own rows here, so this is safe to query wholesale. Pulling the full
  // application lets the form reopen prefilled for edits.
  type MyInterest = Pick<
    CollabInterest,
    | "status"
    | "note"
    | "cv_name"
    | "years_experience"
    | "graduation_year"
    | "age_range"
    | "skills"
    | "is_licensed"
    | "license_note"
    | "has_own_tools"
    | "has_transport"
  >;
  const myInterest = new Map<string, MyInterest>();
  if (profile) {
    const { data: mine } = await supabase
      .from("collab_interests")
      .select(
        "collab_id, status, note, cv_name, years_experience, graduation_year, age_range, skills, is_licensed, license_note, has_own_tools, has_transport",
      )
      .eq("user_id", profile.id);
    for (const r of (mine ?? []) as (MyInterest & { collab_id: string })[]) {
      myInterest.set(r.collab_id, r);
    }
  }

  const sidebar = (
    <nav>
      <SideSection>Type</SideSection>
      <Link href="/collabs">
        <SideLink active={!type}>All collabs</SideLink>
      </Link>
      {TYPE_FILTERS.map((t) => (
        <Link key={t.key} href={`/collabs?type=${t.key}`}>
          <SideLink active={type === t.key}>
            <CollabIcon type={t.key} /> {t.label}
          </SideLink>
        </Link>
      ))}
      {profile && (
        <>
          <SideSection>Yours</SideSection>
          <Link href="/collabs/mine">
            <SideLink>
              <ClipboardList className="size-4" /> My jobs
            </SideLink>
          </Link>
        </>
      )}
    </nav>
  );

  return (
    <AppBody sidebar={sidebar}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Job collabs</h1>
          <p className="mt-0.5 text-[13px] text-zinc-600">
            Need help on a job, or want to learn by tagging along? Post or browse
            below.
          </p>
        </div>
        {profile ? (
          <CollabComposer />
        ) : (
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Sign in to post
          </Link>
        )}
      </div>

      {collabs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No collabs posted yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {collabs.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-brand-500"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-0.5 text-[13px] text-zinc-600">
                    Posted by{" "}
                    <UserName
                      person={c.poster}
                      className="font-medium text-brand-600 hover:underline"
                    />
                    {c.poster?.title ? ` · ${c.poster.title}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[c.type]}`}
                >
                  <CollabIcon type={c.type} className="size-3.5" />
                  {COLLAB_TYPE_LABEL[c.type]}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-zinc-700">{c.body}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-600">
                {c.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {c.location}
                  </span>
                )}
                {c.scheduled_date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {new Date(c.scheduled_date + "T00:00:00").toLocaleDateString(
                      "en-US",
                      { weekday: "short", month: "short", day: "numeric" },
                    )}
                  </span>
                )}
                {c.pay_type && (
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="size-3.5" /> {PAY_LABEL[c.pay_type] ?? c.pay_type}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {c.interested_count} interested
                </span>
              </div>

              {profile && (
                <CollabInterestControl
                  collabId={c.id}
                  userId={profile.id}
                  isOwnPosting={c.poster_id === profile.id}
                  status={myInterest.get(c.id)?.status}
                  application={myInterest.get(c.id) ?? null}
                  trade={c.trade}
                  defaultYears={profile.years_experience}
                  posterUsername={c.poster?.username ?? null}
                  posterIsFounding={!!c.poster?.is_founding_member}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </AppBody>
  );
}

