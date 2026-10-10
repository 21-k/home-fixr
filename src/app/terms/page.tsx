import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Home Fixr, including what HF Community profiles are.",
};

const EFFECTIVE = "October 10, 2026";
const CONTACT = "support@home-fixr.com";

type Section = { id: string; title: string; body: React.ReactNode };

const SECTIONS: Section[] = [
  {
    id: "agreement",
    title: "1. Agreeing to these terms",
    body: (
      <p>
        Home Fixr (&ldquo;Home Fixr&rdquo;, &ldquo;we&rdquo;) runs home-fixr.com, a community where
        apprentices and early-career tradespeople connect with experienced electricians, plumbers and
        HVAC technicians. By creating an account or using the site, you agree to these terms. If you
        don&apos;t agree, please don&apos;t use the site.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "2. Who can use Home Fixr",
    body: (
      <>
        <p>
          You must be at least 16 years old. If you&apos;re under 18, you need permission from a
          parent or guardian to use the site, and their consent before joining any ride-along or job.
        </p>
        <p>
          Job sites have their own age rules, and a poster may need parental consent or extra
          insurance before bringing someone under 18 along. Follow those rules; Home Fixr doesn&apos;t
          check them for you.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. Your account",
    body: (
      <p>
        Give accurate information when you sign up, keep your password to yourself, and use one
        account. You&apos;re responsible for what happens under your account. Handles must follow our
        handle rules; we may reclaim a handle that impersonates someone or breaks these terms.
      </p>
    ),
  },
  {
    id: "what-it-is",
    title: "4. What Home Fixr is, and isn't",
    body: (
      <p>
        Home Fixr is for questions, mentorship, and ride-alongs and collaborations between members. It
        isn&apos;t a marketplace, an employer, a staffing agency or a contractor. We don&apos;t sell
        leads, take payments or commission, or arrange, supervise or guarantee any work, mentorship or
        ride-along. Mentors choose whether to accept a mentorship request; there&apos;s no automatic
        matching.
      </p>
    ),
  },
  {
    id: "hf-community",
    title: "5. HF Community profiles and example content",
    body: (
      <>
        <p>
          Some profiles on the site carry an <strong>HF Community</strong> badge. These are example
          profiles prepared by the Home Fixr team, with AI assistance, to show how the community
          works. <strong>They are not real members.</strong>
        </p>
        <p>
          The posts, replies, ride-along and collaboration listings, applications, follows, mentorships,
          answer counts and helpful votes from HF Community profiles are examples too, not real
          activity. HF Community profiles can&apos;t be messaged and don&apos;t take mentorship requests
          or applications. Any licenses, years of experience or employers they mention are illustrative.
        </p>
      </>
    ),
  },
  {
    id: "advice",
    title: "6. Advice, licenses and credentials",
    body: (
      <>
        <p>
          Answers on Home Fixr are members sharing experience. They aren&apos;t professional, legal,
          safety or code advice. Codes, permits and licensing rules vary by state and town; check with
          your licensing board, your local code official and a licensed professional before acting on
          anything you read here, and don&apos;t do work you aren&apos;t licensed or qualified to do.
        </p>
        <p>
          Licenses, credentials and experience on profiles are self-reported. Home Fixr doesn&apos;t
          verify them, and no badge on the site means a person has been verified.
        </p>
      </>
    ),
  },
  {
    id: "ride-alongs",
    title: "7. Mentorships, ride-alongs and collaborations",
    body: (
      <p>
        Any mentorship, ride-along or collaboration is arranged directly between the members involved,
        at their own risk. Home Fixr isn&apos;t a party to it and doesn&apos;t employ anyone through
        it. The people involved are responsible for agreeing pay, if any, and following employment and
        wage laws, insurance requirements, site safety rules and protective equipment, licensing and
        permit rules, and age rules. Use your judgment before meeting or working alongside anyone, and
        report unsafe or inappropriate behavior to us.
      </p>
    ),
  },
  {
    id: "rules",
    title: "8. Community rules",
    body: (
      <>
        <p>When you use Home Fixr, don&apos;t:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>harass, threaten, demean or discriminate against anyone;</li>
          <li>post spam, ads, or requests for leads or customers;</li>
          <li>impersonate another person or misrepresent your licenses or experience;</li>
          <li>encourage unsafe, unpermitted or illegal work;</li>
          <li>share someone else&apos;s personal information, or upload a resume or file that isn&apos;t yours to share;</li>
          <li>scrape the site, break its security, or upload malicious code.</li>
        </ul>
      </>
    ),
  },
  {
    id: "content",
    title: "9. Your content",
    body: (
      <p>
        You keep ownership of what you post. By posting, you give Home Fixr a non-exclusive,
        royalty-free license to host, display and share it on the site so the service works.
        You&apos;re responsible for what you post. A resume or file you attach to an application is
        shared with the member who posted that listing.
      </p>
    ),
  },
  {
    id: "moderation",
    title: "10. Moderation and ending your account",
    body: (
      <p>
        We may remove content, limit features or suspend or close accounts that break these terms or
        put others at risk. You can stop using Home Fixr at any time; email us to close your account.
      </p>
    ),
  },
  {
    id: "privacy",
    title: "11. Personal information",
    body: (
      <p>
        We use the information you give us (your account, profile, posts, messages and applications)
        to run the site. Your profile shows your handle by default; you choose in Settings whether
        your name is displayed. For questions about your information, or to ask us to delete it,
        email {CONTACT}.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "12. Disclaimers and limits on liability",
    body: (
      <>
        <p>
          Home Fixr is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
          any kind, to the extent the law allows. We don&apos;t promise the site will be uninterrupted or
          error-free, or that anything posted on it is accurate.
        </p>
        <p>
          To the extent the law allows, Home Fixr isn&apos;t liable for indirect, incidental or
          consequential damages, or for anything that happens between members on or off the site,
          including during a mentorship, ride-along or collaboration.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "13. Changes and governing law",
    body: (
      <p>
        We may update these terms. When we do, we&apos;ll change the effective date at the top of this
        page, and continuing to use the site means you accept the update. These terms are governed by
        the laws of the State of New Jersey.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. Contact",
    body: (
      <p>
        Questions, reports or takedown requests:{" "}
        <a href={`mailto:${CONTACT}`} className="font-medium text-brand-600 hover:underline">
          {CONTACT}
        </a>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
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
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-zinc-500">Effective {EFFECTIVE}</p>

        <nav aria-label="Sections" className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 text-[14px]">
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-zinc-700 hover:text-brand-600 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <div className="mt-2 space-y-3 text-[15px] leading-7 text-zinc-700">{s.body}</div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
