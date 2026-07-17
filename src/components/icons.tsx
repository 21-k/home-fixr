import {
  Brain,
  Droplets,
  GraduationCap,
  Handshake,
  Snowflake,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CollabType, TradeType } from "@/lib/types";

const TRADE_ICONS: Record<TradeType, LucideIcon> = {
  electrical: Zap,
  plumbing: Droplets,
  hvac: Snowflake,
  other: Wrench,
};

const COLLAB_ICONS: Record<CollabType, LucideIcon> = {
  extra_hand: Handshake,
  ride_along: GraduationCap,
  specialist: Brain,
};

export function TradeIcon({
  trade,
  className = "size-4",
}: {
  trade: TradeType | null;
  className?: string;
}) {
  const Icon = trade ? TRADE_ICONS[trade] : Wrench;
  return <Icon className={className} aria-hidden />;
}

export function CollabIcon({
  type,
  className = "size-4",
}: {
  type: CollabType;
  className?: string;
}) {
  const Icon = COLLAB_ICONS[type];
  return <Icon className={className} aria-hidden />;
}
