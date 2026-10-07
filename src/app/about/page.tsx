import type { Metadata } from "next";
import Link from "next/link";
import { FoundingBadge } from "@/components/FoundingBadge";
import { FOUNDING_ABOUT_SENTENCE } from "@/lib/founding";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Home Fixr is, and what the Founding Community badge on some accounts means.",
};

/**
 * Minimal About / FAQ page. Its main job is the Founding Community disclosure
 * (seeding plan §0.3): every seeded account's badge links here.
 */
export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
            HF
          </span>
          Home Fixr
        </Link>
        <Link href="/feed" className="text-sm text-zinc-600 hover:text-zinc-900">
          Go to the feed →
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">About Home Fixr</h1>
        <p className="mt-3 text-[15px] leading-7 text-zinc-700">
          Home Fixr is a community where senior plumbers, HVAC techs and
          electricians answer questions and mentor people coming into the trades.
          It&apos;s free, and it&apos;s not a marketplace: no leads, no fees, no
          commission.
        </p>

        <section
          id="founding-community"
          className="mt-10 scroll-mt-20 rounded-xl border border-amber-200 bg-white p-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Founding Community accounts</h2>
            <FoundingBadge size="md" />
          </div>
          <p className="text-[15px] leading-7 text-zinc-800">{FOUNDING_ABOUT_SENTENCE}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[14px] leading-6 text-zinc-700">
            <li>
              Every one of these accounts shows the badge above next to its name,
              on its profile and on everything it posts.
            </li>
            <li>
              They don&apos;t take direct messages, mentorship requests or job
              applications, and they never message members. If you want a
              mentor who&apos;ll answer, use{" "}
              <Link href="/mentors?avail=accepting" className="font-medium text-brand-600 hover:underline">
                Accepting mentees
              </Link>{" "}
              in the mentor directory.
            </li>
            <li>
              Their posts are examples of the kinds of questions people bring
              here. Anything they say about licensing, unions or schools is
              general and can be out of date. Check with the licensing board,
              the Local or the school directly before you act on it.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Questions</h2>
          <div className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white px-6">
            {[
              {
                q: "Does it cost anything?",
                a: "No. There's no fee to join, no lead charges, and no commission.",
              },
              {
                q: "Do you verify licences?",
                a: "No. Your licence is between you and your state board. Use your judgement before working alongside anyone, same as you would off-platform.",
              },
              {
                q: "Why do people post under handles?",
                a: "Most tradespeople don't post under their full name online, so Home Fixr shows your handle by default. You can choose to show your first name and initial, or your full name, in Settings.",
              },
            ].map((item) => (
              <div key={item.q} className="py-4">
                <h3 className="font-semibold">{item.q}</h3>
                <p className="mt-1 text-[14px] leading-6 text-zinc-600">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
