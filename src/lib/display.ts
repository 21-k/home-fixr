// The ONE place a member's public name is decided (plan §2a).
//
// Members post under a handle by default. `full_name` is private: it is only
// rendered in the member's own Settings / welcome screens. Everything that
// shows another person's name goes through displayName().

import type { DisplayPreference } from "@/lib/types";

type Nameable = {
  username: string;
  full_name?: string | null;
  display_preference?: DisplayPreference | null;
};

const PLACEHOLDER_NAMES = new Set(["new member", ""]);

/** "Marcus Daniels" -> "Marcus D."; "Marcus" -> "Marcus"; placeholder -> "". */
export function firstNameInitial(fullName: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return "";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function displayName(p: Nameable | null | undefined): string {
  if (!p) return "Unknown";
  switch (p.display_preference) {
    case "full_name": {
      const full = (p.full_name ?? "").trim();
      return full && !PLACEHOLDER_NAMES.has(full.toLowerCase()) ? full : p.username;
    }
    case "first_name_initial":
      return firstNameInitial(p.full_name) || p.username;
    default:
      return p.username;
  }
}

/** True when the visible name is something other than the handle itself. */
export function showsHandleSeparately(p: Nameable): boolean {
  return displayName(p) !== p.username;
}
