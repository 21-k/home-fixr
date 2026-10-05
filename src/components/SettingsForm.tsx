"use client";

import { useActionState } from "react";
import { DisplayPreferenceField } from "@/components/DisplayPreferenceField";
import { HandleField } from "@/components/HandleField";
import { updateProfile, type FormState } from "@/lib/actions";
import { HANDLE_CHANGE_DAYS } from "@/lib/handles";
import type { Profile } from "@/lib/types";

const initial: FormState = {};
const inputCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

/**
 * `nextHandleChange` is computed on the server (ISO string or null) so render
 * stays pure: null means the handle can be changed now.
 */
export function SettingsForm({
  profile,
  nextHandleChange,
}: {
  profile: Profile;
  nextHandleChange: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initial);
  const locked = nextHandleChange !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <section id="handle" className="flex scroll-mt-20 flex-col gap-4 border-b border-zinc-200 pb-5">
        <h2 className="text-base font-semibold">Public identity</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Handle</span>
            <HandleField
              defaultValue={profile.username}
              currentHandle={profile.username}
              disabled={locked}
              disabledNote={
                locked
                  ? `You can change your handle again on ${new Date(nextHandleChange!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
                  : undefined
              }
            />
            {!locked && (
              <p className="text-[12px] text-zinc-500">
                Your profile lives at /u/your-handle. You can change it once every{" "}
                {HANDLE_CHANGE_DAYS} days; old links to the previous handle stop working.
              </p>
            )}
          </div>
          <DisplayPreferenceField
            defaultValue={profile.display_preference}
            handle={profile.username}
            fullName={profile.full_name}
          />
        </div>
        {profile.role === "senior" && (
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-medium">Mentoring availability</span>
            <select
              name="mentor_availability"
              defaultValue={profile.mentor_availability}
              className={`${inputCls} bg-white`}
            >
              <option value="accepting">Accepting mentees</option>
              <option value="limited">Limited availability</option>
              <option value="not_accepting">Not taking mentees</option>
            </select>
          </label>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Full name <span className="font-normal text-zinc-500">(private unless shown above)</span>
          </span>
          <input name="full_name" defaultValue={profile.full_name} required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Title</span>
          <input
            name="title"
            defaultValue={profile.title ?? ""}
            placeholder="e.g. Master Plumber"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Trade</span>
          <select name="trade" defaultValue={profile.trade ?? ""} className={`${inputCls} bg-white`}>
            <option value="">Choose a trade…</option>
            <option value="plumbing">Plumbing</option>
            <option value="hvac">HVAC</option>
            <option value="electrical">Electrical</option>
            <option value="other">Other / General</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Region</span>
          <input name="region" defaultValue={profile.region ?? ""} placeholder="Newark, NJ" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Years of experience</span>
          <input
            name="years_experience"
            type="number"
            min="0"
            defaultValue={profile.years_experience ?? ""}
            className={inputCls}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Bio</span>
        <textarea
          name="bio"
          rows={4}
          defaultValue={profile.bio ?? ""}
          placeholder="Tell the community about yourself…"
          className={`${inputCls} resize-y`}
        />
      </label>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="is_open_to_messages" defaultChecked={profile.is_open_to_messages} className="size-4" />
        Open to messages
      </label>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="is_open_to_ride_alongs" defaultChecked={profile.is_open_to_ride_alongs} className="size-4" />
        Open to ride-alongs
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.ok && <span className="text-sm text-success-fg">✓ Saved</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
