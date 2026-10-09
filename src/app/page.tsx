import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Handshake,
  MapPin,
  MessageSquare,
  Paperclip,
  Search,
  Star,
  Users,
  Wrench,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";
import { FOUNDING_ABOUT_SENTENCE } from "@/lib/founding";
import { COLLABS_NAV } from "@/lib/format";

const TAGLINE = "Built for people starting out in the skilled trades.";

// ================================================================
// Landing page. Every section is server-rendered and every "screenshot" is
// built from real markup rather than image assets — so the mocks can't drift
// out of date with the product and there's nothing to re-export when the UI
// changes.
// ================================================================

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#who", label: "Who it's for" },
  { href: "#faq", label: "FAQ" },
];

export default async function LandingPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5 sm:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
              HF
            </span>
            Home Fixr
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {profile ? (
              <Link
                href="/feed"
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                Go to your feed →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100"
                >
                  Sign in
                </Link>
                <Link
                  href="/join"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------------------------------------------------- Hero */}
        <section className="border-b border-zinc-200 bg-gradient-to-b from-brand-50/60 to-white">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 sm:py-24">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-medium text-brand-700 ring-1 ring-brand-200">
              <GraduationCap className="size-3.5" />
              {TAGLINE}
            </span>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Find a mentor in your trade.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
              Home Fixr connects apprentices and early-career electricians,
              plumbers, and HVAC technicians with experienced tradespeople. Find a
              mentor, explore ride-along opportunities, and ask questions in the
              community.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="hero-ctas">
              <Link
                href="/mentors"
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Find a mentor <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/join?role=mentor"
                className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium hover:bg-zinc-100"
              >
                Become a mentor
              </Link>
              <Link
                href="/feed"
                className="px-2 py-3 text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
              >
                Browse the community
              </Link>
            </div>

            <p className="mt-6 text-[13px] text-zinc-500">
              Free to join. No leads, no invoicing, no commission — this is a
              community, not a marketplace.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- Problem */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
            <Eyebrow>The gap</Eyebrow>
            <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Trade school teaches you the work. It doesn&apos;t teach you the job.
            </h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-zinc-600">
              How to talk to a customer who&apos;s already angry. How to price a job
              without underselling yourself. How to handle an inspector, a bad site,
              or a request that&apos;s outside your license. That knowledge gets
              passed one-to-one — and it&apos;s nearly impossible to reach if you
              don&apos;t already have family or friends in the field.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  q: "“What do I charge?”",
                  a: "Everyone's first instinct is to undercharge. A veteran will tell you in one sentence.",
                },
                {
                  q: "“Can I refuse this?”",
                  a: "Knowing when to walk away from a job is a skill nobody puts on a syllabus.",
                },
                {
                  q: "“Who do I call?”",
                  a: "The referral network you build in year one shapes the next ten.",
                },
              ].map((item) => (
                <div key={item.q} className="rounded-xl border border-zinc-200 p-5">
                  <p className="font-medium">{item.q}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Features */}
        <div id="features" className="scroll-mt-16">
          <FeatureSection
            eyebrow="Mentor directory"
            Icon={Handshake}
            title="Find a mentor near you, in your trade"
            body="Browse mentors by trade and region, then send a mentorship request. Mentors choose whether to accept, so nobody's cold-emailing into the void."
            points={[
              "See each mentor's trade, region, and self-reported experience up front",
              "Filter to mentors open to hosting ride-alongs",
              "Requests are two-sided: mentors accept or decline, so nobody's spammed",
            ]}
            cta={{ href: "/mentors", label: "Find a mentor" }}
            mock={<MentorMock />}
          />

          <FeatureSection
            reverse
            tinted
            eyebrow="Ride-alongs and collaborations"
            Icon={Wrench}
            title="Learn on a real job, or find a hand for one"
            body="Mentors can post ride-along opportunities, and tradespeople can find collaborators for a job. Apply with a short introduction and attach a resume if you have one."
            points={[
              "Posters see every applicant in one place and accept or decline",
              "Track what you posted and applied to in My opportunities",
              "Filter by apprentice ride-along, extra hand, or specialist",
            ]}
            cta={{ href: "/collabs", label: "Browse ride-alongs and collaborations" }}
            mock={<CollabMock />}
          />

          <FeatureSection
            eyebrow="Community feed"
            Icon={MessageSquare}
            title="Ask the people who've actually done it"
            body="Post a question, a tip, or a discussion, and get answers from experienced tradespeople. Filter the feed by trade so you're reading work that looks like yours."
            points={[
              "Mark the answer that solved it, so the next person finds it fast",
              "Flag replies as helpful to surface the ones that earned it",
              "Filter by plumbing, HVAC, electrical, or general",
            ]}
            cta={{ href: "/feed", label: "Browse the community" }}
            mock={<ThreadMock />}
          />

          <FeatureSection
            eyebrow="Messages, follows & alerts"
            Icon={Bell}
            title="Keep the conversation going after the thread"
            body="Direct messages for the questions you'd rather not ask in public. Follow the people whose answers you keep learning from. Notifications when someone replies, accepts your answer, or applies to your ride-along."
            points={[
              "1:1 messages with anyone open to them",
              "Follow experienced tradespeople and keep up with what they post",
              "Alerts for replies, mentorship requests, and applications",
            ]}
            cta={{ href: "/messages", label: "Open messages" }}
            mock={<MessageMock />}
          />

          <FeatureSection
            reverse
            tinted
            eyebrow="Profiles"
            Icon={Users}
            title="A profile that shows what you know"
            body="Your trade, your region, your years in, and the answers you've given. For apprentices it's a record of what you're learning. For mentors it's a record of the help you've handed down."
            points={[
              "Recent posts and answers on every profile",
              "Set whether you're open to messages and ride-alongs",
              "Search across posts and members to find both",
            ]}
            cta={{ href: "/search", label: "Search the community" }}
            mock={<ProfileMock />}
          />
        </div>

        {/* --------------------------------------------------- Positioning */}
        <section className="border-y border-zinc-200 bg-zinc-900 text-white">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
            <h2 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
              We don&apos;t sell you leads. We don&apos;t take a cut.
            </h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-zinc-300">
              Platforms like Angie and TaskRabbit make money charging tradespeople
              for leads. Home Fixr sits upstream of all that — on the relationships
              and knowledge that decide whether someone is still in the trade in
              five years. That means no invoicing, no payments, and no commission.
            </p>
            <dl className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                { t: "No lead fees", d: "Nobody pays to be introduced to anyone here." },
                { t: "No payment rails", d: "Arrange work between yourselves, the way the trade already does." },
                { t: "No gatekeeping", d: "We're not a certification body. Your license is between you and your state." },
              ].map((x) => (
                <div key={x.t}>
                  <dt className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-4 text-brand-300" /> {x.t}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-zinc-400">{x.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* --------------------------------------------------- How it works */}
        <section id="how" className="scroll-mt-16 border-b border-zinc-200">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Three steps, about five minutes
            </h2>

            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              {[
                {
                  n: "1",
                  t: "Tell us where you are in the trade",
                  d: "Pick apprentice or mentor, your trade, and your region. That's the whole signup.",
                },
                {
                  n: "2",
                  t: "Ask, answer, or browse",
                  d: "Post your first question, or read what's already been answered in your trade.",
                },
                {
                  n: "3",
                  t: "Find your people",
                  d: "Send a mentorship request, apply for a ride-along, or follow the experienced tradespeople worth learning from.",
                },
              ].map((s) => (
                <li key={s.n} className="rounded-xl border border-zinc-200 p-6">
                  <span className="grid size-8 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------- Who it's for */}
        <section id="who" className="scroll-mt-16 border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Two sides of the same trade
            </h2>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-7">
                <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <GraduationCap className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">If you&apos;re starting out</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                  Apprentices, early-career tradespeople, and career switchers in
                  their first few years.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {[
                    "Ask the questions you don't want to ask your boss",
                    "Find a mentor who works in your trade and region",
                    "Apply for ride-alongs on real job sites",
                    "Learn pricing, customers, and permits from people who've done it",
                  ].map((li) => (
                    <Bullet key={li}>{li}</Bullet>
                  ))}
                </ul>
                <Link
                  href="/join"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Join as an apprentice <ArrowRight className="size-4" />
                </Link>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-7">
                <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Wrench className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">If you&apos;ve been doing this a while</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                  Master plumbers, HVAC techs, electricians, and shop owners with
                  hard-won answers.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {[
                    "Answer once, help everyone who searches it later",
                    "Take on a mentee on your own terms — you accept or decline",
                    "Find an extra hand or a specialist when a job needs one",
                    "Build a reputation that isn't a paid ad placement",
                  ].map((li) => (
                    <Bullet key={li}>{li}</Bullet>
                  ))}
                </ul>
                <Link
                  href="/join?role=mentor"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-100"
                >
                  Become a mentor <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ FAQ */}
        <section id="faq" className="scroll-mt-16 border-b border-zinc-200">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:px-10 sm:py-20">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Fair things to ask
            </h2>

            <div className="mt-8 divide-y divide-zinc-200">
              {[
                {
                  q: "Does it cost anything?",
                  a: "No. There's no fee to join, no lead charges, and no commission — we don't sit between you and any money.",
                },
                {
                  q: "Is this how I find customers?",
                  a: "No, and that's deliberate. Home Fixr is for mentorship and collaboration between tradespeople. If you're looking for homeowner leads, this isn't the tool.",
                },
                {
                  q: "Do you verify licenses?",
                  a: "We don't. Licenses, credentials and experience on profiles are self-reported, and verification isn't a platform feature — your license is between you and your state board. Use your judgment before working alongside anyone, same as you would off-platform.",
                },
                {
                  q: "I'm an experienced tradesperson. How much time does mentoring take?",
                  a: "As little as you want. Answer a question when you've got five minutes. Mentorship requests are opt-in, and you can turn off ride-alongs and messages in your settings.",
                },
                {
                  q: "What are the Founding Community profiles and team-written examples?",
                  a: FOUNDING_ABOUT_SENTENCE,
                },
                {
                  q: "Which trades are covered?",
                  a: "Plumbing, HVAC, and electrical are the focus today, with a general category for everything adjacent. We'd rather be genuinely useful in a few trades than thin across twenty.",
                },
              ].map((item) => (
                <div key={item.q} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="font-semibold">{item.q}</h3>
                  <p className="mt-1.5 text-[15px] leading-7 text-zinc-600">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Final CTA */}
        <section className="bg-brand-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center sm:px-10 sm:py-20">
            <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Somebody taught them. Now it&apos;s your turn — on either side of it.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-zinc-600">
              Join the community and post your first question, or answer one that&apos;s
              been sitting there waiting for someone like you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/join"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600"
              >
                Join Home Fixr <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/feed"
                className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium hover:bg-zinc-100"
              >
                Browse the community
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
                HF
              </span>
              Home Fixr
            </Link>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">
              A community where experienced tradespeople mentor apprentices.
              Community, not a marketplace.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {[
              { href: "/feed", label: "Feed" },
              { href: "/mentors", label: "Mentors" },
              { href: "/collabs", label: COLLABS_NAV },
              { href: "/search", label: "Search" },
              { href: "/about", label: "About" },
              { href: "/join", label: "Join" },
              { href: "/login", label: "Sign in" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="text-zinc-600 hover:text-zinc-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-zinc-100 px-6 py-5 text-center text-xs text-zinc-500 sm:px-10">
          home-fixr.com · {TAGLINE}
        </div>
      </footer>
    </div>
  );
}

// ================================================================
// Layout helpers
// ================================================================

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[13px] font-semibold uppercase tracking-wide text-brand-600">
      {children}
    </span>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed text-zinc-700">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-500" />
      <span>{children}</span>
    </li>
  );
}

function FeatureSection({
  eyebrow,
  Icon,
  title,
  body,
  points,
  cta,
  mock,
  reverse = false,
  tinted = false,
}: {
  eyebrow: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  points: string[];
  cta: { href: string; label: string };
  mock: ReactNode;
  reverse?: boolean;
  tinted?: boolean;
}) {
  return (
    <section
      className={`border-b border-zinc-200 ${tinted ? "bg-zinc-50" : "bg-white"}`}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-2 lg:gap-14">
        <div className={reverse ? "lg:order-2" : undefined}>
          <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="size-5" />
          </span>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-4 text-[15px] leading-7 text-zinc-600">{body}</p>
          <ul className="mt-5 flex flex-col gap-2">
            {points.map((p) => (
              <Bullet key={p}>{p}</Bullet>
            ))}
          </ul>
          <Link
            href={cta.href}
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            {cta.label} <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className={reverse ? "lg:order-1" : undefined} aria-hidden="true">
          {mock}
        </div>
      </div>
    </section>
  );
}

/** Frame that makes the mocks below read as product screenshots. */
function MockFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="ml-auto text-[11px] font-medium text-zinc-400">Illustration</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MockAvatar({ initials }: { initials: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {initials}
    </span>
  );
}

// ================================================================
// Faux-UI mocks — decorative, marked aria-hidden by the caller.
// ================================================================

function ThreadMock() {
  return (
    <MockFrame>
      <div className="flex gap-3">
        <MockAvatar initials="ER" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-zinc-500">
            Emma Reyes · Apprentice Plumber · 2h ago
          </p>
          <p className="mt-1 text-sm font-semibold">
            First customer asked me to do work I&apos;m not licensed for. How do I say no?
          </p>
          <span className="mt-2 inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            Question · Plumbing
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-success-fg/20 bg-success-bg p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-success-fg">
          <CheckCircle2 className="size-3.5" /> Accepted answer
        </p>
        <div className="mt-2 flex gap-3">
          <MockAvatar initials="MR" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Mike Rodriguez · Master Plumber · 28 years</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-700">
              Easy script: “outside my license — if something goes wrong your
              insurance won&apos;t cover it. Let me put you in touch with someone I
              trust.” Then actually have someone to refer.
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
              <Star className="size-3.5" /> 41 found this helpful
            </p>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function MentorMock() {
  const mentors = [
    { i: "LC", n: "Linda Chen", t: "HVAC Technician · 22 years", r: "Edison, NJ", ride: true },
    { i: "TM", n: "Tony Martinez", t: "Master Electrician · 30 years", r: "Jersey City, NJ", ride: false },
    { i: "SW", n: "Sarah Williams", t: "HVAC Specialist · 18 years", r: "Trenton, NJ", ride: true },
  ];
  return (
    <MockFrame>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex flex-1 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[13px] text-zinc-400">
          <Search className="size-3.5" /> Search mentors…
        </span>
        <span className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700">
          HVAC
        </span>
      </div>
      <div className="flex flex-col divide-y divide-zinc-100">
        {mentors.map((m) => (
          <div key={m.i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <MockAvatar initials={m.i} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.n}</p>
              <p className="truncate text-xs text-zinc-600">{m.t}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="size-3" /> {m.r}
              </p>
            </div>
            {m.ride && (
              <span className="shrink-0 rounded bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success-fg">
                Hosts ride-alongs
              </span>
            )}
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

function CollabMock() {
  return (
    <MockFrame>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            Apprentices welcome: boiler install ride-along, Saturday
          </p>
          <p className="mt-0.5 text-[13px] text-zinc-600">
            Dave Kowalski · Plumber · 25 years
          </p>
        </div>
        <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
          Apprentice ride-along
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" /> Trenton, NJ
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3" /> Sat, Aug 1
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" /> 2 interested
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-500">Your application</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-700">
          Second-year apprentice in Newark, I can be in Trenton by 7. I&apos;ve never
          seen a full boiler swap start to finish.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-zinc-700 ring-1 ring-zinc-200">
            <Paperclip className="size-3" /> emma-reyes-resume.pdf
          </span>
          <span className="rounded bg-success-bg px-2 py-1 text-[11px] font-medium text-success-fg">
            ✓ Accepted
          </span>
        </div>
      </div>
    </MockFrame>
  );
}

function MessageMock() {
  return (
    <MockFrame>
      <div className="flex items-center gap-2.5 border-b border-zinc-100 pb-3">
        <MockAvatar initials="TM" />
        <div>
          <p className="text-sm font-semibold">Tony Martinez</p>
          <p className="text-xs text-zinc-500">Master Electrician · Jersey City, NJ</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 py-3">
        <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-[13px] leading-relaxed text-zinc-800">
          Sent you 3 licensed electricians in NJ I&apos;d send my own mother to.
        </p>
        <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-brand-500 px-3 py-2 text-[13px] leading-relaxed text-white">
          That&apos;s huge, thank you. Referring instead of turning it down flat —
          hadn&apos;t thought of that.
        </p>
      </div>

      <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
        <Bell className="size-3.5 shrink-0 text-brand-500" />
        <p className="text-xs text-zinc-600">
          Sarah Williams is interested in your ride-along
        </p>
      </div>
    </MockFrame>
  );
}

function ProfileMock() {
  return (
    <MockFrame>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          MR
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Mike Rodriguez</p>
          <p className="text-[13px] text-zinc-600">
            Master Plumber · 28 years · Newark, NJ
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success-fg">
              Open to messages
            </span>
            <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              Open to ride-alongs
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-zinc-700">
        30 years of fixing other people&apos;s mistakes. Happy to help you avoid most
        of mine.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 text-center">
        {[
          { n: "34", l: "Answers" },
          { n: "12", l: "Accepted" },
          { n: "3", l: "Mentees" },
        ].map((s) => (
          <div key={s.l}>
            <p className="text-lg font-semibold">{s.n}</p>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 p-2.5">
        <FileText className="size-3.5 shrink-0 text-zinc-400" />
        <p className="truncate text-xs text-zinc-600">
          The shutoff valve nobody tells you about
        </p>
      </div>
    </MockFrame>
  );
}
