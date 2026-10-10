import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * The three-column app shell used by the authenticated screens.
 * Left sidebar + main, plus an optional right rail. Below lg the sidebar
 * collapses into a disclosure at the top of main (labelled `mobileLabel`),
 * so its filters and links stay reachable on phones and tablets.
 */
export function AppBody({
  sidebar,
  right,
  mobileLabel = "Browse",
  children,
}: {
  sidebar: ReactNode;
  right?: ReactNode;
  mobileLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`mx-auto grid w-full max-w-[1200px] grid-cols-1 ${
        right
          ? "lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_280px]"
          : "lg:grid-cols-[240px_1fr]"
      }`}
    >
      <aside className="hidden border-r border-zinc-200 bg-white px-3 py-5 lg:block">
        {sidebar}
      </aside>
      <main className="min-h-[640px] min-w-0 bg-zinc-50 px-4 py-6 sm:px-7">
        <details
          data-testid="mobile-sidebar"
          className="group mb-4 rounded-xl border border-zinc-200 bg-white lg:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-700 [&::-webkit-details-marker]:hidden">
            {mobileLabel}
            <ChevronDown className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-zinc-200 px-1 pb-2">{sidebar}</div>
        </details>
        {children}
      </main>
      {right && (
        <aside className="hidden border-l border-zinc-200 bg-white px-5 py-5 xl:block">
          {right}
        </aside>
      )}
    </div>
  );
}

export function SideSection({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 px-3 py-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </div>
  );
}

/** A sidebar row. With `href` it's a link (marked aria-current when active). */
export function SideLink({
  children,
  href,
  active = false,
}: {
  children: ReactNode;
  href?: string;
  active?: boolean;
}) {
  const className = `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
    active ? "bg-brand-50 font-medium text-brand-700" : "text-zinc-700"
  }`;
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? "" : "hover:bg-zinc-100"}`}
    >
      {children}
    </Link>
  );
}
