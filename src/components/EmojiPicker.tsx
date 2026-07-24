"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

// A small curated set beats a 1,800-emoji grid here — and beats adding a
// dependency. Weighted toward what actually comes up in trade conversations.
const GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Common",
    emoji: ["👍", "👌", "🙏", "💪", "🤝", "👏", "🙌", "✅", "❌", "⚠️", "❓", "❗"],
  },
  {
    label: "Faces",
    emoji: ["😀", "😅", "😂", "🙂", "😉", "😎", "🤔", "😬", "😩", "😳", "🤯", "🫡"],
  },
  {
    label: "Trade",
    emoji: ["🔧", "🔨", "🪛", "🧰", "🪜", "⚡", "🔌", "💡", "🚰", "🚿", "🔥", "❄️"],
  },
  {
    label: "Job",
    emoji: ["🏠", "🏢", "🚚", "📅", "⏰", "📋", "📸", "📄", "💰", "☕", "🎉", "🫠"],
  },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a popover that traps you is worse
  // than no popover.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add an emoji"
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        <Smile className="size-4.5" />
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 z-30 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {g.label}
              </p>
              <div className="flex flex-wrap">
                {g.emoji.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onPick(e);
                      setOpen(false);
                    }}
                    className="grid size-8 place-items-center rounded-md text-lg hover:bg-zinc-100"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
