"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { checkHandleAvailability } from "@/lib/actions";
import {
  HANDLE_MAX,
  HANDLE_STATUS_COPY,
  handleFormatError,
  type HandleStatus,
} from "@/lib/handles";

const inputCls =
  "w-full rounded-lg border border-zinc-300 py-2 pl-7 pr-9 text-sm outline-none focus:border-brand-500 disabled:bg-zinc-50 disabled:text-zinc-500";

/**
 * Handle input with a live availability check and optional suggestions.
 * Format errors are shown instantly; reserved/taken come from the
 * check_handle RPC (debounced). The submitted value is the `username` field.
 */
export function HandleField({
  defaultValue,
  currentHandle,
  suggestions = [],
  disabled = false,
  disabledNote,
}: {
  defaultValue: string;
  /** The member's handle today — always "available" to them. */
  currentHandle: string;
  suggestions?: string[];
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [remote, setRemote] = useState<{ handle: string; status: HandleStatus } | null>(null);
  const [okSuggestions, setOkSuggestions] = useState<string[]>([]);

  const trimmed = value.trim();
  const isCurrent = trimmed.toLowerCase() === currentHandle.toLowerCase();
  const formatError = handleFormatError(trimmed);

  // Debounced server check for the typed value.
  useEffect(() => {
    if (disabled || formatError || isCurrent) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const status = await checkHandleAvailability(trimmed);
      if (!cancelled) setRemote({ handle: trimmed, status });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, formatError, isCurrent, disabled]);

  // Only offer suggestions that are actually free.
  // Keyed by the joined string so a new array with the same ideas doesn't refetch.
  const suggestionKey = suggestions.join("|");
  useEffect(() => {
    const list = suggestionKey ? suggestionKey.split("|") : [];
    if (disabled || list.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const checked = await Promise.all(
        list.map(async (s) => ((await checkHandleAvailability(s)) === "ok" ? s : null)),
      );
      if (!cancelled) setOkSuggestions(checked.filter((s): s is string => Boolean(s)));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [suggestionKey, disabled]);

  let status: HandleStatus | "checking" | "current";
  if (formatError) status = formatError;
  else if (isCurrent) status = "current";
  else if (remote?.handle === trimmed) status = remote.status;
  else status = "checking";

  const good = status === "ok" || status === "current";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-zinc-400">
          @
        </span>
        <input
          name="username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={HANDLE_MAX}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!good && status !== "checking"}
          className={inputCls}
        />
        {/* A disabled input isn't submitted; keep the current value posted. */}
        {disabled && <input type="hidden" name="username" value={currentHandle} />}
        <span className="absolute top-1/2 right-3 -translate-y-1/2">
          {status === "checking" ? (
            <Loader2 className="size-4 animate-spin text-zinc-400" />
          ) : good ? (
            <Check className="size-4 text-success-fg" />
          ) : (
            <X className="size-4 text-red-600" />
          )}
        </span>
      </div>

      <p className={`text-[12px] ${good || status === "checking" ? "text-zinc-500" : "text-red-700"}`}>
        {disabled && disabledNote
          ? disabledNote
          : status === "current"
            ? "This is your handle now."
            : status === "checking"
              ? "Checking…"
              : HANDLE_STATUS_COPY[status]}
      </p>

      {!disabled && okSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
          <span>Ideas:</span>
          {okSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className="rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 font-medium text-zinc-700 hover:border-brand-500 hover:text-brand-700"
            >
              @{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
