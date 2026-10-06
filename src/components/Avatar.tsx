import Link from "next/link";
import {
  Flame,
  Hammer,
  HardHat,
  Plug,
  Snowflake,
  Thermometer,
  User,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { avatarColors, isAvatarIcon, type AvatarIconKey } from "@/lib/avatar";

const SIZES = {
  sm: { box: "size-8 text-xs", icon: "size-4" },
  md: { box: "size-9 text-[13px]", icon: "size-[18px]" },
  lg: { box: "size-14 text-lg", icon: "size-7" },
  xl: { box: "size-20 text-2xl", icon: "size-10" },
} as const;

const ICONS: Record<AvatarIconKey, LucideIcon> = {
  wrench: Wrench,
  flame: Flame,
  plug: Plug,
  snowflake: Snowflake,
  hardhat: HardHat,
  zap: Zap,
  thermometer: Thermometer,
  hammer: Hammer,
};

/** The profile fields an avatar needs (all selected by AUTHOR_COLS). */
export type AvatarPerson = {
  username?: string | null;
  avatar_initials?: string | null;
  avatar_style?: string | null;
  avatar_icon?: string | null;
};

/**
 * One avatar for every surface. Three styles (migration 0011):
 *  - initials: on a muted colour pair derived from the handle
 *  - icon:     a trade icon on a muted tile
 *  - none:     a neutral grey silhouette
 * No photos (seeding plan §5a).
 */
export function Avatar({
  person,
  size = "md",
  href,
  label,
}: {
  person: AvatarPerson | null | undefined;
  size?: keyof typeof SIZES;
  href?: string;
  /** Accessible name; defaults to the handle. */
  label?: string;
}) {
  const s = SIZES[size];
  const style = person?.avatar_style ?? "initials";
  const seed = person?.username ?? person?.avatar_initials ?? "?";
  const { bg, fg } = avatarColors(seed);
  const name = label ?? (person?.username ? `@${person.username}` : "Member");

  let content: React.ReactNode;
  let colors: React.CSSProperties;
  if (style === "none" || !person) {
    content = <User className={s.icon} aria-hidden />;
    colors = { backgroundColor: "#e4e4e7", color: "#71717a" };
  } else if (style === "icon" && isAvatarIcon(person.avatar_icon)) {
    const Icon = ICONS[person.avatar_icon];
    content = <Icon className={s.icon} aria-hidden />;
    colors = { backgroundColor: bg, color: fg };
  } else {
    content = person.avatar_initials || "??";
    colors = { backgroundColor: bg, color: fg };
  }

  const base = `grid shrink-0 place-items-center rounded-full font-semibold ${s.box}`;
  if (href) {
    return (
      <Link
        href={href}
        aria-label={name}
        style={colors}
        className={`${base} transition-transform hover:scale-105 hover:outline-2 hover:outline-brand-300`}
      >
        {content}
      </Link>
    );
  }
  return (
    <span role="img" aria-label={name} style={colors} className={base}>
      {content}
    </span>
  );
}
