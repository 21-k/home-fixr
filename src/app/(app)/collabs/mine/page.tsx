import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { CollabFilledBadge, CollabFilledToggle } from "@/components/CollabFilled";
import { CollabIcon } from "@/components/icons";
import { UserName } from "@/components/UserName";
import { respondToCollabInterest, toggleCollabInterest } from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { isCollabFilled, shouldOfferMarkFilled } from "@/lib/collabs";
import { displayName } from "@/lib/display";
import { loginHref } from "@/lib/next-path";
import { COLLAB_TYPE_LABEL, profileHeadline, timeAgo } from "@/lib/format";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { ageRangeLabel } from "@/lib/skills";
import { CV_BUCKET, CV_SIGNED_URL_SECONDS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type {
  AuthorLite,
  CollabInterest,
  CollabInterestStatus,
  JobCollab,
} from "@/lib/types";


const STATUS_BADGE: Record<CollabInterestStatus, { label: string; className: string }> = {
  interested: {
    label: "Awaiting reply",
    className: "border border-zinc-300 text-zinc-500",
  },
  accepted: {
    label: "✓ Accepted",
    className: "bg-success-bg text-success-fg",
  },
  declined: {
    label: "Not this time",
    className: "border border-zinc-300 text-zinc-500",
  },
};

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const sidebar = (
    <nav>
      <SideSection>Jobs</SideSection>
      <SideLink href="/collabs">
        <Briefcase className="size-4" /> All collabs
      </SideLink>
      <SideLink href="/collabs/mine" active>
        <ClipboardList className="size-4" /> My jobs
      </SideLink>
    </nav>
  );

  if (!me) {
    return (
      <AppBody sidebar={sidebar} mobileLabel="Jobs">
        <h1 className="mb-4 text-xl font-semibold">My jobs</h1>
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          <Link
            href={loginHref("/collabs/mine")}
            className="font-medium text-brand-600 hover:underline"
          >
            Sign in
          </Link>{" "}
          to track the jobs you&apos;ve posted and applied to.
        </p>
      </AppBody>
    );
  }

  // Jobs I posted.
  const { data: postedData } = await supabase
    .from("job_collabs")
    .select("*")
    .eq("poster_id", me.id)
    .order("created_at", { ascending: false });
  const posted = (postedData ?? []) as JobCollab[];
  const postedIds = new Set(posted.map((c) => c.id));

  // RLS on collab_interests returns exactly two things: rows where I'm the
  // applicant, and rows on collabs I posted. So an unfiltered select gives us
  // both halves of this page in one round trip.
  const { data: interestData } = await supabase
    .from("collab_interests")
    .select("*")
    .order("created_at", { ascending: false });
  const interests = (interestData ?? []) as CollabInterest[];

  const applicants = interests.filter(
    (i) => postedIds.has(i.collab_id) && i.user_id !== me.id,
  );
  const myInterests = interests.filter((i) => i.user_id === me.id);

  // Resolve the applicant profiles.
  const peopleById = new Map<string, AuthorLite>();
  const applicantIds = Array.from(new Set(applicants.map((i) => i.user_id)));
  if (applicantIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select(AUTHOR_COLS)
      .in("id", applicantIds);
    for (const p of (data ?? []) as AuthorLite[]) peopleById.set(p.id, p);
  }

  // Resolve the collabs I applied to (plus their posters).
  const collabsById = new Map<string, JobCollab>();
  for (const c of posted) collabsById.set(c.id, c);
  const missingCollabIds = Array.from(
    new Set(myInterests.map((i) => i.collab_id).filter((id) => !collabsById.has(id))),
  );
  if (missingCollabIds.length) {
    const { data } = await supabase
      .from("job_collabs")
      .select("*")
      .in("id", missingCollabIds);
    for (const c of (data ?? []) as JobCollab[]) collabsById.set(c.id, c);
  }
  const posterIds = Array.from(
    new Set(
      myInterests
        .map((i) => collabsById.get(i.collab_id)?.poster_id)
        .filter((id): id is string => Boolean(id) && !peopleById.has(id!)),
    ),
  );
  if (posterIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select(AUTHOR_COLS)
      .in("id", posterIds);
    for (const p of (data ?? []) as AuthorLite[]) peopleById.set(p.id, p);
  }

  // Mint short-lived download links for every attached CV. The bucket is
  // private; Storage RLS lets me sign these only because I either uploaded the
  // file or I posted the job it's attached to (migration 0005).
  const cvUrls = new Map<string, string>();
  const cvPaths = Array.from(
    new Set(
      [...applicants, ...myInterests]
        .map((i) => i.cv_path)
        .filter((p): p is string => Boolean(p)),
    ),
  );
  if (cvPaths.length) {
    const { data: signed } = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrls(cvPaths, CV_SIGNED_URL_SECONDS);
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) cvUrls.set(row.path, row.signedUrl);
    }
  }

  const byCollab = (collabId: string) =>
    applicants.filter((i) => i.collab_id === collabId);

  return (
    <AppBody sidebar={sidebar} mobileLabel="Jobs">
      <h1 className="mb-1 text-xl font-semibold">My jobs</h1>
      <p className="mb-5 text-[13px] text-zinc-600">
        Jobs you posted and who&apos;s interested, plus the ones you&apos;ve put
        your hand up for.
      </p>

      {posted.length === 0 && myInterests.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Nothing here yet.{" "}
          <Link href="/collabs" className="font-medium text-brand-600 hover:underline">
            Browse collabs
          </Link>{" "}
          or post one of your own.
        </p>
      )}

      {posted.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
            Jobs you posted ({posted.length})
          </h2>
          <div className="flex flex-col gap-3">
            {posted.map((c) => {
              const rows = byCollab(c.id);
              const filled = isCollabFilled(c);
              const accepted = rows.filter((i) => i.status === "accepted");
              return (
                <div
                  key={c.id}
                  id={`collab-${c.id}`}
                  data-testid="my-posted-collab"
                  data-filled={filled ? "true" : "false"}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <CollabHeading collab={c} />

                  {shouldOfferMarkFilled(c, rows.map((i) => i.status)) ? (
                    <div
                      data-testid="offer-mark-filled"
                      className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success-fg"
                    >
                      <span className="mr-auto">
                        You accepted{" "}
                        {accepted
                          .map((i) => displayName(peopleById.get(i.user_id) ?? null))
                          .join(", ")}
                        . Is the position filled now?
                      </span>
                      <CollabFilledToggle collabId={c.id} filled={false} emphasis />
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-[13px] text-zinc-600">
                        {filled
                          ? "Marked filled: it shows as Position filled and takes no new applications."
                          : "Open: taking applications."}
                      </span>
                      <CollabFilledToggle collabId={c.id} filled={filled} />
                    </div>
                  )}

                  {rows.length === 0 ? (
                    <p className="mt-3 border-t border-zinc-100 pt-3 text-[13px] text-zinc-500">
                      No one interested yet.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col divide-y divide-zinc-100 border-t border-zinc-100">
                      {rows.map((i) => {
                        const person = peopleById.get(i.user_id) ?? null;
                        return (
                          <div key={i.id} className="flex gap-3 py-3">
                            <Avatar
                              person={person}
                              size="md"
                              href={person ? `/u/${person.username}` : undefined}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2">
                                <UserName
                                  person={person}
                                  className="text-sm font-semibold hover:text-brand-500"
                                />
                                <span className="text-xs text-zinc-500">
                                  {timeAgo(i.created_at)}
                                </span>
                              </div>
                              <div className="truncate text-xs text-zinc-600">
                                {person ? profileHeadline(person) : ""}
                              </div>
                              {i.note && (
                                <p className="mt-1.5 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] leading-relaxed text-zinc-700 wrap-anywhere">
                                  {i.note}
                                </p>
                              )}
                              <ApplicationDetail interest={i} />
                              {i.cv_path && (
                                <div className="mt-1.5">
                                  <CvLink
                                    url={cvUrls.get(i.cv_path)}
                                    name={i.cv_name}
                                  />
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {i.status === "interested" ? (
                                  <>
                                    <form action={respondToCollabInterest}>
                                      <input type="hidden" name="interest_id" value={i.id} />
                                      <input type="hidden" name="decision" value="accepted" />
                                      <button className="rounded-lg bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600">
                                        Accept
                                      </button>
                                    </form>
                                    <form action={respondToCollabInterest}>
                                      <input type="hidden" name="interest_id" value={i.id} />
                                      <input type="hidden" name="decision" value="declined" />
                                      <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100">
                                        Decline
                                      </button>
                                    </form>
                                  </>
                                ) : (
                                  <Badge status={i.status} />
                                )}
                                {person && <MessageLink username={person.username} />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {myInterests.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
            Jobs you&apos;re interested in ({myInterests.length})
          </h2>
          <div className="flex flex-col gap-3">
            {myInterests.map((i) => {
              const c = collabsById.get(i.collab_id);
              const poster = c ? peopleById.get(c.poster_id) ?? null : null;
              if (!c) return null;
              return (
                <div
                  key={i.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <CollabHeading collab={c} />
                  {i.note && (
                    <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] leading-relaxed text-zinc-700 wrap-anywhere">
                      {i.note}
                    </p>
                  )}
                  <ApplicationDetail interest={i} />
                  {i.cv_path && (
                    <div className="mt-1.5">
                      <CvLink url={cvUrls.get(i.cv_path)} name={i.cv_name} />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
                    {isCollabFilled(c) && i.status === "interested" ? (
                      <CollabFilledBadge />
                    ) : (
                      <Badge status={i.status} />
                    )}
                    <span className="text-[13px] text-zinc-600">
                      Posted by{" "}
                      <UserName
                        person={poster}
                        className="font-medium text-brand-600 hover:underline"
                      />
                      {" · you applied "}
                      {timeAgo(i.created_at)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {poster && <MessageLink username={poster.username} />}
                      {i.status !== "accepted" && (
                        <form action={toggleCollabInterest}>
                          <input type="hidden" name="collab_id" value={c.id} />
                          <input type="hidden" name="is_interested" value="true" />
                          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100">
                            Withdraw
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AppBody>
  );
}

function CollabHeading({ collab }: { collab: JobCollab }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">
          <Link href={`/collabs#collab-${collab.id}`} className="hover:text-brand-500">
            {collab.title}
          </Link>
        </h3>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isCollabFilled(collab) && <CollabFilledBadge />}
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            <CollabIcon type={collab.type} className="size-3.5" />
            {COLLAB_TYPE_LABEL[collab.type]}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-600">
        {collab.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {collab.location}
          </span>
        )}
        {collab.scheduled_date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {new Date(collab.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The screening detail from an application (migration 0008): time in the trade,
 * graduation year, age band, skills, licence, tools, transport.
 *
 * Renders nothing when an applicant filled none of it in — everything past the
 * pitch is optional, and an empty grid of dashes reads worse than absence.
 */
function ApplicationDetail({ interest: i }: { interest: CollabInterest }) {
  const facts: { label: string; value: string }[] = [];
  if (i.years_experience != null) {
    facts.push({
      label: "In the trade",
      value: `${i.years_experience} ${i.years_experience === 1 ? "yr" : "yrs"}`,
    });
  }
  if (i.graduation_year != null) {
    facts.push({ label: "Graduated", value: String(i.graduation_year) });
  }
  const age = ageRangeLabel(i.age_range);
  if (age) facts.push({ label: "Age", value: age });
  if (i.is_licensed) {
    facts.push({ label: "Licensed", value: i.license_note || "Yes" });
  }

  const badges: string[] = [];
  if (i.has_own_tools) badges.push("Own tools");
  if (i.has_transport) badges.push("Own transport");

  const skills = i.skills ?? [];
  if (facts.length === 0 && badges.length === 0 && skills.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3">
      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
                {f.label}
              </dt>
              <dd className="text-[13px] font-medium text-zinc-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {i.age_range === "under_18" && (
        <p className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            Applicant is under 18 — check site age rules, parental consent, and
            your insurance before bringing them along.
          </span>
        </p>
      )}

      {skills.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {skills.map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-medium text-brand-700"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1 rounded bg-success-bg px-2 py-0.5 text-[12px] font-medium text-success-fg"
            >
              <Check className="size-3" /> {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Download link for an attached CV. `url` is a signed, expiring link — if
 * signing failed (expired session, deleted object) we show the filename
 * without a dead link rather than a broken download.
 */
function CvLink({ url, name }: { url: string | undefined; name: string | null }) {
  const label = name ?? "Attached CV";
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500">
        <FileText className="size-3.5" /> {label} (unavailable)
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline"
    >
      <FileText className="size-3.5" /> {label}
    </a>
  );
}

function Badge({ status }: { status: CollabInterestStatus }) {
  const { label, className } = STATUS_BADGE[status];
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{label}</span>
  );
}

function MessageLink({ username }: { username: string }) {
  return (
    <Link
      href={`/messages/${username}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
    >
      <MessageSquare className="size-3.5" /> Message
    </Link>
  );
}
