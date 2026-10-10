import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CircleDot,
  ClipboardList,
  ListFilter,
  MapPin,
  Users,
} from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { CollabComposer } from "@/components/CollabComposer";
import { CollabFilledBadge } from "@/components/CollabFilled";
import { CollabIcon } from "@/components/icons";
import { CollabInterestControl } from "@/components/CollabInterestControl";
import { TeamWrittenLabel } from "@/components/TeamWrittenLabel";
import { UserName } from "@/components/UserName";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  COLLAB_FILLED_MESSAGE,
  COLLABS_EMPTY_MESSAGE,
  collabsHref,
  isCollabFilled,
  parseCollabStatusFilter,
  sortCollabsOpenFirst,
} from "@/lib/collabs";
import { loginHref } from "@/lib/next-path";
import { isTeamWritten } from "@/lib/founding";
import { COLLAB_TYPE_LABEL, COLLABS_TITLE } from "@/lib/format";
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
  { key: "ride_along", label: "Apprentice ride-along" },
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

export const metadata: Metadata = { title: COLLABS_TITLE };

export default async function CollabsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type, status: rawStatus } = await searchParams;
  const status = parseCollabStatusFilter(rawStatus);
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  let query = supabase
    .from("job_collabs")
    .select(`*, poster:profiles ( ${AUTHOR_COLS} )`)
    .order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);
  if (status === "open") query = query.is("filled_at", null);

  const { data } = await query;
  // Open jobs first, then filled ones (each newest first).
  const collabs = sortCollabsOpenFirst((data ?? []) as unknown as CollabWithPoster[]);

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
      <SideLink href={collabsHref({ status })} active={!type}>All types</SideLink>
      {TYPE_FILTERS.map((t) => (
        <SideLink key={t.key} href={collabsHref({ type: t.key, status })} active={type === t.key}>
          <CollabIcon type={t.key} /> {t.label}
        </SideLink>
      ))}
      <SideSection>Status</SideSection>
      <SideLink href={collabsHref({ type })} active={status === "all"}>
        <ListFilter className="size-4" /> All, open first
      </SideLink>
      <SideLink href={collabsHref({ type, status: "open" })} active={status === "open"}>
        <CircleDot className="size-4" /> Open only
      </SideLink>
      {profile && (
        <>
          <SideSection>Yours</SideSection>
          <SideLink href="/collabs/mine">
            <ClipboardList className="size-4" /> My opportunities
          </SideLink>
        </>
      )}
    </nav>
  );

  return (
    <AppBody sidebar={sidebar} mobileLabel="Filter opportunities">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{COLLABS_TITLE}</h1>
          <p className="mt-0.5 text-[13px] text-zinc-600">
            Mentors post ride-along opportunities, and tradespeople find
            collaborators for a job. Post or browse below.
          </p>
        </div>
        {profile ? (
          <CollabComposer />
        ) : (
          <Link
            href={loginHref("/collabs")}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Sign in to post
          </Link>
        )}
      </div>

      {/* The sidebar is hidden on small screens, so the status filter also
          lives here. */}
      <div
        className="mb-3 flex flex-wrap items-center gap-2 text-[13px]"
        role="group"
        aria-label="Filter by status"
      >
        <FilterChip href={collabsHref({ type })} active={status === "all"}>
          All, open first
        </FilterChip>
        <FilterChip href={collabsHref({ type, status: "open" })} active={status === "open"}>
          Open only
        </FilterChip>
      </div>

      {collabs.length === 0 ? (
        <p
          data-testid="collabs-empty"
          className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500"
        >
          {COLLABS_EMPTY_MESSAGE}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {collabs.map((c) => {
            const filled = isCollabFilled(c);
            return (
            <div
              key={c.id}
              id={`collab-${c.id}`}
              data-testid="collab-card"
              data-filled={filled ? "true" : "false"}
              className={`rounded-xl border p-5 transition-colors ${
                filled
                  ? "border-zinc-200 bg-zinc-50"
                  : "border-zinc-200 bg-white hover:border-brand-500"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {isTeamWritten(c, c.poster) && <TeamWrittenLabel className="mb-1.5" />}
                  <h3 className={`font-semibold wrap-anywhere ${filled ? "text-zinc-600" : ""}`}>{c.title}</h3>
                  <p className="mt-0.5 text-[13px] text-zinc-600">
                    Posted by{" "}
                    <UserName
                      person={c.poster}
                      className="font-medium text-brand-600 hover:underline"
                    />
                    {c.poster?.title ? ` · ${c.poster.title}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {filled && <CollabFilledBadge />}
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[c.type]}`}
                  >
                    <CollabIcon type={c.type} className="size-3.5" />
                    {COLLAB_TYPE_LABEL[c.type]}
                  </span>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-700 wrap-anywhere">{c.body}</p>

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

              {profile ? (
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
                  filled={filled}
                />
              ) : (
                filled && (
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-[13px] leading-relaxed text-zinc-600">
                    {COLLAB_FILLED_MESSAGE}
                  </p>
                )
              )}
            </div>
            );
          })}
        </div>
      )}
    </AppBody>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 font-medium ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
