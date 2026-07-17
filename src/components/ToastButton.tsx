"use client";

import { useState, useRef } from "react";

type Variant = "brand" | "secondary" | "nav" | "sidebar" | "link";

const VARIANTS: Record<Variant, string> = {
  brand:
    "rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600",
  secondary:
    "rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100",
  nav: "rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  sidebar:
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
  link: "text-left hover:text-brand-500",
};

/**
 * A button for interactions the prototype doesn't persist yet (messaging,
 * following, filters). Shows a transient toast so the flow still feels alive.
 */
export function ToastButton({
  label,
  message,
  variant = "secondary",
  className = "",
}: {
  label: React.ReactNode;
  message: string;
  variant?: Variant;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fire() {
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
  }

  return (
    <>
      <button type="button" onClick={fire} className={`${VARIANTS[variant]} ${className}`}>
        {label}
      </button>
      {show && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg">
          {message}
        </div>
      )}
    </>
  );
}
