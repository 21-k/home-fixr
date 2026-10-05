"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { signOut } from "@/lib/auth/actions";
import { displayName } from "@/lib/display";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/mentors", label: "Mentors" },
  { href: "/collabs", label: "Jobs" },
  { href: "/messages", label: "Messages" },
];

export function AppHeader({
  profile,
  unread = 0,
}: {
  profile: Profile | null;
  unread?: number;
}) {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
          HF
        </span>
        Home Fixr
      </Link>

      <form action="/search" className="hidden md:block">
        <input
          type="search"
          name="q"
          placeholder="Search posts & members…"
          className="w-56 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:bg-white"
        />
      </form>

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
      </nav>

      {profile ? (
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href={`/u/${profile.username}`} className="hidden font-medium sm:block">
            {displayName(profile)}
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
