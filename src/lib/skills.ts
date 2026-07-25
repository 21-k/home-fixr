import type { TradeType } from "@/lib/types";

// Curated, trade-specific skill lists for the job application form.
//
// A fixed list rather than free text, so posters can scan applications at a
// glance and we can filter on them later. Kept short on purpose — a checklist
// of 40 items gets abandoned, and these are the things that actually decide
// whether someone is useful on a given job.

export const SKILLS_BY_TRADE: Record<TradeType, string[]> = {
  plumbing: [
    "Repipes",
    "Drain cleaning",
    "Water heaters",
    "Boilers / hydronics",
    "Fixture install",
    "Gas lines",
    "Backflow prevention",
    "Camera inspection",
    "Soldering / press fit",
  ],
  hvac: [
    "Split systems",
    "Rooftop units",
    "Refrigeration",
    "Ductwork",
    "Heat pumps",
    "Controls / thermostats",
    "Brazing",
    "Charging & recovery",
    "Load calculations",
  ],
  electrical: [
    "Panel upgrades",
    "Service entrance",
    "Rough-in wiring",
    "Troubleshooting",
    "EV chargers",
    "Generators",
    "Low voltage / data",
    "Conduit bending",
    "Motor controls",
  ],
  other: [
    "Demo",
    "Framing",
    "Drywall patching",
    "Tiling",
    "Painting",
    "Site cleanup",
    "Material handling",
  ],
};

/** Applies on any job regardless of trade. */
export const GENERAL_SKILLS = [
  "Customer-facing",
  "Reading blueprints",
  "Permit paperwork",
  "Ladder / heights work",
  "Confined spaces",
  "Bilingual (EN/ES)",
];

/**
 * The skill checklist for a job. Untyped-trade jobs get the general list plus a
 * merge of everything, so a poster who left trade blank still gets useful
 * answers.
 */
export function skillsForTrade(trade: TradeType | null): string[] {
  if (trade) return [...SKILLS_BY_TRADE[trade], ...GENERAL_SKILLS];
  const all = new Set<string>();
  for (const list of Object.values(SKILLS_BY_TRADE)) {
    for (const s of list) all.add(s);
  }
  return [...all, ...GENERAL_SKILLS];
}

export const MAX_SKILLS = 20;

// ---------------------------------------------------------------
// Age bands. Coarse by design — see the privacy note in migration 0008.
// ---------------------------------------------------------------

export const AGE_RANGES = [
  { value: "undisclosed", label: "Prefer not to say" },
  { value: "under_18", label: "Under 18" },
  { value: "18_24", label: "18–24" },
  { value: "25_34", label: "25–34" },
  { value: "35_44", label: "35–44" },
  { value: "45_54", label: "45–54" },
  { value: "55_plus", label: "55+" },
] as const;

export const AGE_RANGE_VALUES = AGE_RANGES.map((r) => r.value);

export function ageRangeLabel(value: string | null): string | null {
  if (!value || value === "undisclosed") return null;
  return AGE_RANGES.find((r) => r.value === value)?.label ?? null;
}
