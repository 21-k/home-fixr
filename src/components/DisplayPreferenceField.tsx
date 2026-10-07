import { firstNameInitial } from "@/lib/display";
import type { DisplayPreference } from "@/lib/types";

/**
 * "How should your name appear?" — handle (default), first name + initial, or
 * full name. Shows a live-ish preview using the member's own details.
 */
export function DisplayPreferenceField({
  defaultValue,
  handle,
  fullName,
}: {
  defaultValue: DisplayPreference;
  handle: string;
  fullName: string;
}) {
  const initial = firstNameInitial(fullName);
  const options: { value: DisplayPreference; label: string; example: string }[] = [
    { value: "handle", label: "My handle", example: `@${handle}` },
    { value: "first_name_initial", label: "First name + initial", example: initial || "(add your name)" },
    { value: "full_name", label: "Full name", example: fullName || "(add your name)" },
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">How your name appears to others</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2.5 text-sm">
          <input
            type="radio"
            name="display_preference"
            value={o.value}
            defaultChecked={defaultValue === o.value}
            className="size-4"
          />
          <span>{o.label}</span>
          <span className="text-[13px] text-zinc-500">— {o.example}</span>
        </label>
      ))}
    </fieldset>
  );
}
