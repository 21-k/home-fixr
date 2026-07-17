"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ToastButton } from "@/components/ToastButton";
import { signOut } from "@/lib/auth/actions";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/mentors", label: "Mentors" },
  { href: "/collabs", label: "Jobs" },
];

export function AppHeader({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
          HF
        </span>
        Home Fixr
      </Link>

      <nav className="flex items-center gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <ToastButton
          variant="nav"
          label="Messages"
          message="Messages aren't built yet — coming in a future update."
        />
      </nav>

      {profile ? (
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/u/${profile.username}`} className="hidden font-medium sm:block">
            {profile.full_name}
          </Link>
          <Avatar initials={profile.avatar_initials} href={`/u/${profile.username}`} />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:text-zinc-900"
            >
              Log out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Sign in
          </Link>
          <Link
            href="/join"
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Join
          </Link>
        </div>
      )}
    </header>
  );
}
