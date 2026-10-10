/**
 * Badge for the example profiles the Home Fixr team prepared (plan §0.3).
 * Rendered next to the name everywhere one of those profiles appears. Plain
 * text (not a link); what it means is set out in the Terms of Service and the
 * About page, and in the hover note below.
 */
export function FoundingBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "px-2 py-0.5 text-xs"
      : "px-1.5 py-px text-[10px]";
  return (
    <span
      data-testid="hf-community-badge"
      title="HF Community: an example profile prepared by the Home Fixr team with AI assistance. Not a real member."
      className={`inline-flex shrink-0 items-center rounded border border-amber-300 bg-amber-50 font-semibold uppercase tracking-wide text-amber-800 ${cls}`}
    >
      HF Community
    </span>
  );
}
