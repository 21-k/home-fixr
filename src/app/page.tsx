import Link from "next/link";
import { Handshake, MessageSquare, Wrench } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";

const FEATURES = [
  {
    href: "/feed",
    Icon: MessageSquare,
    title: "Ask the people who know",
    body: "Post a question and get answers from people with 20+ years on the job, not random internet strangers.",
  },
  {
    href: "/mentors",
    Icon: Handshake,
    title: "Find a mentor",
    body: "Browse senior pros by trade and region. Send a message, set up a call, or shadow them on a job.",
  },
  {
    href: "/collabs",
    Icon: Wrench,
    title: "Team up when it counts",
    body: "Need a second hand or a specialist? Post a collab. Looking for ride-along experience? Find one.",
  },
];

export default async function LandingPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3.5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
            HF
          </span>
          Home Fixr
        </Link>
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
                Join the community
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:px-10 sm:py-24">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          The trades pass down knowledge one conversation at a time.{" "}
          <span className="text-brand-500">Now at scale.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
          Home Fixr connects new vocational graduates — future plumbers, HVAC
          techs, and electricians — with senior tradespeople who&apos;ve been
          doing the work for decades. Ask questions, find mentors, and team up on
          jobs when an extra set of hands matters.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/join"
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700"
          >
            I&apos;m new to the trade →
          </Link>
          <Link
            href="/join"
            className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium hover:bg-zinc-100"
          >
            I&apos;m a senior pro
          </Link>
        </div>

        <div className="mt-20 grid gap-5 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="rounded-xl border border-zinc-200 p-6 transition-all hover:-translate-y-0.5 hover:border-brand-500"
            >
              <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <f.Icon className="size-5" />
              </span>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                {f.body}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
