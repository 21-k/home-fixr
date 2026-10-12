import { LogoMark } from "@/components/LogoMark";
import { FOUNDING_BADGE_NOTE } from "@/lib/founding";

/**
 * Marks the example profiles the Home Fixr team prepared (plan §0.3): just the
 * HF logo, next to the name everywhere one of those profiles appears. No
 * visible text and no hover note (kept low-distraction); screen readers get
 * FOUNDING_BADGE_NOTE as its name, and the Terms of Service (section 5) and the
 * About page set out what it means. Plain, not a link.
 */
export function FoundingBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      data-testid="hf-community-badge"
      role="img"
      aria-label={FOUNDING_BADGE_NOTE}
      className="inline-flex shrink-0 items-center"
    >
      <LogoMark className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}
