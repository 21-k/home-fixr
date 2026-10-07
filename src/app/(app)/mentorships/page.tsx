import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Handshake, Home, Users } from "lucide-react";
import { AppBody, SideLink, SideSection } from "@/components/AppBody";
import { Avatar } from "@/components/Avatar";
import { UserName } from "@/components/UserName";
import { respondToMentorship } from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { loginHref } from "@/lib/next-path";
import { profileHeadline, timeAgo } from "@/lib/format";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite, MentorshipStatus } from "@/lib/types";

type Row = {
  id: string;
  junior_id: string;
  senior_id: string;
  status: MentorshipStatus;
  created_at: string;
};

export const metadata: Metadata = { title: "Mentorships" };

export default async function MentorshipsPage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const sidebar = (
    <nav>
      <SideSection>Community</SideSection>
      <SideLink href="/feed">
        <Home className="size-4" /> Feed
      </SideLink>
      <SideLink href="/mentors">
        <Users className="size-4" /> Find mentors
      </SideLink>
      <SideLink href="/mentorships" active>
        <Handshake className="size-4" /> My mentorships
      </SideLink>
    </nav>
  );

  if (!me) redirect(loginHref("/mentorships"));

  const { data: rowsData } = await supabase
    .from("mentorships")
    .select("id, junior_id, senior_id, status, created_at")
    .or(`junior_id.eq.${me.id},senior_id.eq.${me.id}`)
    .order("created_at", { ascending: false });
  const rows = (rowsData ?? []) as Row[];

  // Resolve the counterpart profile for each row.
  const otherIds = Array.from(
    new Set(rows.map((r) => (r.junior_id === me.id ? r.senior_id : r.junior_id))),
  );
  const profilesById = new Map<string, AuthorLite>();
  if (otherIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select(AUTHOR_COLS)
      .in("id", otherIds);
    for (const p of (profs ?? []) as AuthorLite[]) profilesById.set(p.id, p);
  }
  const other = (r: Row) =>
    profilesById.get(r.junior_id === me.id ? r.senior_id : r.junior_id) ?? null;

  const incoming = rows.filter((r) => r.senior_id === me.id && r.status === "pending");
  const mentees = rows.filter((r) => r.senior_id === me.id && r.status === "active");
  const mentors = rows.filter((r) => r.junior_id === me.id && r.status === "active");
  const sent = rows.filter((r) => r.junior_id === me.id && r.status === "pending");

  return (
    <AppBody sidebar={sidebar} mobileLabel="Community">
      <h1 className="mb-1 text-xl font-semibold">Mentorships</h1>
      <p className="mb-5 text-[13px] text-zinc-600">
        Requests, mentors, and mentees — all in one place.
      </p>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No mentorships yet.{" "}
          <Link href="/mentors" className="font-medium text-brand-600 hover:underline">
            Find a mentor
          </Link>{" "}
          to get started.
        </p>
      )}

      {incoming.length > 0 && (
        <Section title={`Requests for you (${incoming.length})`}>
          {incoming.map((r) => (
            <PersonRow key={r.id} person={other(r)} meta={`Requested ${timeAgo(r.created_at)}`}>
              <div className="flex gap-2">
                <form action={respondToMentorship}>
                  <input type="hidden" name="mentorship_id" value={r.id} />
                  <input type="hidden" name="decision" value="active" />
                  <button className="rounded-lg bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600">
                    Accept
                  </button>
                </form>
                <form action={respondToMentorship}>
                  <input type="hidden" name="mentorship_id" value={r.id} />
                  <input type="hidden" name="decision" value="declined" />
                  <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100">
                    Decline
                  </button>
                </form>
              </div>
            </PersonRow>
          ))}
        </Section>
      )}

      {mentors.length > 0 && (
        <Section title={`Your mentors (${mentors.length})`}>
          {mentors.map((r) => (
            <PersonRow key={r.id} person={other(r)} meta="Active mentor">
              <span className="rounded bg-success-bg px-2 py-0.5 text-xs font-medium text-success-fg">
                ✓ Active
              </span>
            </PersonRow>
          ))}
        </Section>
      )}

      {mentees.length > 0 && (
        <Section title={`Your mentees (${mentees.length})`}>
          {mentees.map((r) => (
            <PersonRow key={r.id} person={other(r)} meta="Active mentee">
              <span className="rounded bg-success-bg px-2 py-0.5 text-xs font-medium text-success-fg">
                ✓ Active
              </span>
            </PersonRow>
          ))}
        </Section>
      )}

      {sent.length > 0 && (
        <Section title={`Requests you've sent (${sent.length})`}>
          {sent.map((r) => (
            <PersonRow key={r.id} person={other(r)} meta={`Sent ${timeAgo(r.created_at)}`}>
              <span className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-500">
                Pending
              </span>
            </PersonRow>
          ))}
        </Section>
      )}
    </AppBody>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="flex flex-col divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function PersonRow({
  person,
  meta,
  children,
}: {
  person: AuthorLite | null;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Avatar
        person={person}
        size="md"
        href={person ? `/u/${person.username}` : undefined}
      />
      <div className="min-w-0 flex-1">
        <UserName person={person} className="text-sm font-semibold hover:text-brand-500" />
        <div className="truncate text-xs text-zinc-600">
          {person ? profileHeadline(person) : meta}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
