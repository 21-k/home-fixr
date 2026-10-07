// Handle (username) rules shared by the welcome step and Settings.
//
// The database is the source of truth (migration 0009: format check, reserved
// list, case-insensitive uniqueness, 30-day change limit). This file mirrors
// only the FORMAT rule so the form can give instant feedback; anything about
// reserved words or availability comes from the `check_handle` RPC.

import type { TradeType } from "@/lib/types";

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 22;
export const HANDLE_CHANGE_DAYS = 30;

const HANDLE_CHARS = /^[A-Za-z0-9_.]+$/;

export type HandleStatus =
  | "ok"
  | "taken"
  | "reserved"
  | "empty"
  | "too_short"
  | "too_long"
  | "bad_chars"
  | "dot_edge"
  | "rate_limited"
  | "error";

/** Same rules, same reason codes, as public.handle_format_error(). */
export function handleFormatError(h: string): HandleStatus | null {
  if (!h) return "empty";
  if (h.length < HANDLE_MIN) return "too_short";
  if (h.length > HANDLE_MAX) return "too_long";
  if (!HANDLE_CHARS.test(h)) return "bad_chars";
  if (h.startsWith(".") || h.endsWith(".")) return "dot_edge";
  return null;
}

export const HANDLE_STATUS_COPY: Record<HandleStatus, string> = {
  ok: "Available",
  taken: "That handle is taken.",
  reserved: "That handle is reserved. Try another.",
  empty: "Pick a handle.",
  too_short: `At least ${HANDLE_MIN} characters.`,
  too_long: `${HANDLE_MAX} characters max.`,
  bad_chars: "Letters, numbers, underscores and dots only.",
  dot_edge: "Can't start or end with a dot.",
  rate_limited: `Handles can be changed once every ${HANDLE_CHANGE_DAYS} days.`,
  error: "Couldn't check that handle right now.",
};

/**
 * Map a Supabase/PostgREST error from a profile update onto friendly copy.
 * The 0009 triggers put a stable code in the error hint ("handle_taken", ...).
 */
export function handleErrorMessage(err: { message?: string; hint?: string | null }): string {
  const hint = err.hint ?? "";
  if (hint.startsWith("handle_")) {
    const code = hint.slice("handle_".length) as HandleStatus;
    if (code in HANDLE_STATUS_COPY) return HANDLE_STATUS_COPY[code];
  }
  if (/profiles_username_lower_idx|profiles_username_key/.test(err.message ?? "")) {
    return HANDLE_STATUS_COPY.taken;
  }
  return err.message ?? "Something went wrong.";
}

const TRADE_WORDS: Record<TradeType, string[]> = {
  electrical: ["Elec", "Sparky", "Wires"],
  plumbing: ["Plumb", "Pipes", "PEX"],
  hvac: ["HVAC", "Heat", "Duct"],
  other: ["Trades", "Tools", "Fixr"],
};

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

/** "Old Bridge, NJ" -> "OldBridge"; "Toms River" -> "TomsRiver". */
function placeToken(region: string | null | undefined): string {
  const town = (region ?? "").split(",")[0] ?? "";
  return town
    .split(/\s+/)
    .map((w) => cap(w.replace(/[^A-Za-z]/g, "")))
    .join("")
    .slice(0, 12);
}

/** Small deterministic hash so suggestions are stable across renders. */
function hashDigits(s: string, n = 2): string {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000003;
  return String(h % 10 ** n).padStart(n, "0");
}

/**
 * 2–3 handle ideas from first name + trade + town, e.g. MarcusD_Elec,
 * Marcus_OldBridge, OldBridgeSparky. Only format-valid suggestions are
 * returned; availability is checked separately.
 */
export function suggestHandles(input: {
  fullName?: string | null;
  trade?: TradeType | null;
  region?: string | null;
}): string[] {
  const parts = (input.fullName ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  const isPlaceholder = parts.join(" ").toLowerCase() === "new member";
  const first = isPlaceholder ? "" : cap(parts[0] ?? "");
  const initial = !isPlaceholder && parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : "";
  const words = TRADE_WORDS[input.trade ?? "other"];
  const place = placeToken(input.region);
  const seed = `${first}|${input.trade ?? ""}|${place}`;

  const out: string[] = [];
  const push = (h: string) => {
    if (!handleFormatError(h) && !out.some((o) => o.toLowerCase() === h.toLowerCase())) out.push(h);
  };

  if (first) push(`${first}${initial}_${words[0]}`);
  if (first && place) push(`${first}_${place}`);
  if (place) push(`${place}${words[1]}`);
  if (first) push(`${first.toLowerCase()}_${words[2].toLowerCase()}${hashDigits(seed)}`);
  push(`${words[1]}_${hashDigits(seed, 3)}`);

  return out.slice(0, 3);
}
