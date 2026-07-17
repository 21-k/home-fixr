import type { ReactNode } from "react";

/**
 * The three-column app shell used by the authenticated screens.
 * Left sidebar + main, plus an optional right rail. Side columns collapse on
 * narrow viewports, matching the wireframe's mobile behavior.
 */
export function AppBody({
  sidebar,
  right,
  children,
}: {
  sidebar: ReactNode;
  right?: ReactNode;
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
      <main className="min-h-[640px] bg-zinc-50 px-7 py-6">{children}</main>
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

export function SideLink({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
        active
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-zinc-700"
      }`}
    >
      {children}
    </div>
  );
}
