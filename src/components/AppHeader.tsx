"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { signOut } from "@/lib/auth/actions";
import { displayName } from "@/lib/display";
import { COLLABS_NAV } from "@/lib/format";
import { loginHref } from "@/lib/next-path";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/mentors", label: "Mentors" },
  { href: "/collabs", label: COLLABS_NAV },
  { href: "/messages", label: "Messages" },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

/**
 * The app header. At lg+ it's one row: logo, search, nav, account. Below lg
 * the nav, search and account links move into a menu panel behind a toggle
 * (the bell stays visible), so nothing is pushed off-screen on a phone.
 */
export function AppHeader({
  profile,
  unread = 0,
}: {
  profile: Profile | null;
  unread?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the menu whenever the route changes (state-during-render, not an
  // effect, per React's "adjusting state when a prop changes").
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const signInHref = loginHref(pathname);

  const navLinks = (mobile: boolean) =>
    NAV.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-sm ${mobile ? "block" : ""} ${
            active
              ? "bg-zinc-100 font-medium text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          {item.label}
        </Link>
      );
    });

  const bell = profile && (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      aria-current={isActive(pathname, "/notifications") ? "page" : undefined}
      className="relative rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );

  const searchForm = (className: string) => (
    <form action="/search" role="search" className={className}>
      <input
        type="search"
        name="q"
        aria-label="Search posts and members"
        placeholder="Search posts & members…"
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:bg-white focus-visible:ring-2 focus-visible:ring-brand-200"
      />
    </form>
  );

  return (
    <header className="relative z-30 border-b border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
            HF
          </span>
          Home Fixr
        </Link>

        {searchForm("hidden w-56 lg:block")}

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navLinks(false)}
        </nav>

        {profile ? (
          <div className="hidden items-center gap-3 text-sm lg:flex">
            {bell}
            <Link href={`/u/${profile.username}`} className="font-medium">
              {displayName(profile)}
            </Link>
            <Avatar person={profile} href={`/u/${profile.username}`} />
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
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href={signInHref}
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

        <div className="flex items-center gap-1 lg:hidden">
          {bell}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="rounded-md p-2 text-zinc-700 hover:bg-zinc-100"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-zinc-200 bg-white px-4 pb-4 pt-3 shadow-lg sm:px-6 lg:hidden"
        >
          {searchForm("mb-3")}
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {navLinks(true)}
          </nav>
          <div className="mt-3 border-t border-zinc-200 pt-3">
            {profile ? (
              <div className="flex flex-col gap-0.5 text-sm">
                <Link
                  href={`/u/${profile.username}`}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 font-medium hover:bg-zinc-100"
                >
                  <Avatar person={profile} size="sm" />
                  {displayName(profile)}
                </Link>
                <Link href="/notifications" className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100">
                  Notifications{unread > 0 ? ` (${unread})` : ""}
                </Link>
                <Link href="/mentorships" className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100">
                  My mentorships
                </Link>
                <Link href="/settings" className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100">
                  Settings
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-md px-3 py-2 text-left text-zinc-600 hover:bg-zinc-100"
                  >
                    Log out
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link
                  href={signInHref}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                >
                  Sign in
                </Link>
                <Link
                  href="/join"
                  className="flex-1 rounded-lg bg-brand-500 px-3.5 py-2 text-center text-sm font-medium text-white hover:bg-brand-600"
                >
                  Join
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
