// Avatar styles (migration 0011; seeding plan §5a: no photos, no faces).
// Shared by <Avatar>, the Settings picker and the server action.

export type AvatarStyle = "initials" | "icon" | "none";
export type AvatarIconKey =
  | "wrench"
  | "flame"
  | "plug"
  | "snowflake"
  | "hardhat"
  | "zap"
  | "thermometer"
  | "hammer";

export const AVATAR_STYLES: AvatarStyle[] = ["initials", "icon", "none"];

/** Same set as the profiles_avatar_icon_valid check constraint. */
export const AVATAR_ICON_OPTIONS: { key: AvatarIconKey; label: string }[] = [
  { key: "wrench", label: "Pipe wrench" },
  { key: "flame", label: "Flame" },
  { key: "snowflake", label: "Snowflake" },
  { key: "thermometer", label: "Thermometer" },
  { key: "plug", label: "Plug" },
  { key: "zap", label: "Bolt" },
  { key: "hardhat", label: "Hard hat" },
  { key: "hammer", label: "Hammer" },
];

export function isAvatarIcon(v: unknown): v is AvatarIconKey {
  return AVATAR_ICON_OPTIONS.some((o) => o.key === v);
}

// Muted background / readable foreground pairs that sit next to the brand
// purple without competing with it. Every fg/bg pair is above 4.5:1 contrast.
const PAIRS: { bg: string; fg: string }[] = [
  { bg: "#ede7fb", fg: "#4c2f8a" }, // lavender
  { bg: "#e3efe6", fg: "#2f5b3a" }, // sage
  { bg: "#f3eadb", fg: "#6b4a1f" }, // sand
  { bg: "#e2eaf3", fg: "#2d4a6b" }, // slate blue
  { bg: "#f4e3df", fg: "#7a3b2e" }, // clay
  { bg: "#dff0ef", fg: "#1f5c58" }, // teal
  { bg: "#ecefdc", fg: "#4f5a1f" }, // olive
  { bg: "#f2e4ec", fg: "#6e3354" }, // mauve
];

/** Deterministic colour pair for a handle, so a member's avatar never changes colour. */
export function avatarColors(seed: string): { bg: string; fg: string } {
  // FNV-1a, then fold the high bits in: a plain *31 hash mod 8 clusters
  // similar handles onto the same colour.
  let h = 0x811c9dc5;
  for (const ch of seed.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return PAIRS[h % PAIRS.length];
}
