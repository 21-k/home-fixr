"use client";

import { useActionState, useState } from "react";
import { GraduationCap, Wrench, type LucideIcon } from "lucide-react";
import { DisplayPreferenceField } from "@/components/DisplayPreferenceField";
import { HandleField } from "@/components/HandleField";
import { completeOnboarding, skipOnboarding, type FormState } from "@/lib/actions";
import { suggestHandles } from "@/lib/handles";
import type { Profile, TradeType, UserRole } from "@/lib/types";

const initial: FormState = {};
const inputCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

export function WelcomeForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initial);
  const [role, setRole] = useState<UserRole>(profile.role);
  // Tracked so handle ideas can follow what the member types below.
  const [trade, setTrade] = useState<string>(profile.trade ?? "");
  const [region, setRegion] = useState<string>(profile.region ?? "");
  const [name, setName] = useState<string>(profile.full_name);
  const suggestions = suggestHandles({
    fullName: name,
    trade: (trade || null) as TradeType | null,
    region,
  });

  return (
    <>
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="role" value={role} />

        <div>
          <h2 className="mb-3 text-base font-semibold">
            Which side of the trade are you on?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleCard
              selected={role === "junior"}
              onSelect={() => setRole("junior")}
              Icon={GraduationCap}
              title="I'm new to the trade"
              desc="Apprentice, recent vocational grad, or career switcher. Here to learn."
            />
            <RoleCard
              selected={role === "senior"}
              onSelect={() => setRole("senior")}
              Icon={Wrench}
              title="I'm a senior pro"
              desc="Years on the job. Happy to answer questions and mentor newcomers."
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold">Pick a handle</h2>
          <p className="mb-4 text-[13px] text-zinc-500">
            This is how you&apos;ll appear on the Feed. Your full name stays private
            unless you share it.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <HandleField
              defaultValue={profile.username}
              currentHandle={profile.username}
              suggestions={suggestions}
            />
            <DisplayPreferenceField
              defaultValue={profile.display_preference}
              handle={profile.username}
              fullName={name}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold">A bit about your work</h2>
          <p className="mb-4 text-[13px] text-zinc-500">
            All optional — but trade and region are what let people find you.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Trade</span>
              <select
                name="trade"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className={`${inputCls} bg-white`}
              >
                <option value="">Choose a trade…</option>
                <option value="plumbing">Plumbing</option>
                <option value="hvac">HVAC</option>
                <option value="electrical">Electrical</option>
                <option value="other">Other / General</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Region</span>
              <input
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Newark, NJ"
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Years in the trade</span>
              <input
                name="years_experience"
                type="number"
                min={0}
                max={70}
                defaultValue={profile.years_experience ?? ""}
                placeholder={role === "senior" ? "15" : "1"}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {role === "senior" ? "Title" : "What you're working toward"}
              </span>
              <input
                name="title"
                defaultValue={profile.title ?? ""}
                placeholder={role === "senior" ? "Master Plumber" : "Apprentice Electrician"}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">
                Your name <span className="font-normal text-zinc-500">(private unless you choose to show it)</span>
              </span>
              <input
                name="full_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marcus Johnson"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            Joining as{" "}
            <strong>{role === "junior" ? "a new entrant" : "a senior pro"}</strong>
          </p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Finish and go to the feed →"}
          </button>
        </div>
      </form>

      {/* Separate form so this isn't a submit button inside the one above. */}
      <form action={skipOnboarding} className="mt-4 text-center">
        <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900">
          Skip for now
        </button>
      </form>
    </>
  );
}

function RoleCard({
  selected,
  onSelect,
  Icon,
  title,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  Icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border-2 p-5 text-left transition-colors ${
        selected ? "border-brand-500 bg-brand-50" : "border-zinc-200 bg-white hover:border-brand-500"
      }`}
    >
      <span className="mb-2.5 grid size-9 place-items-center rounded-lg bg-brand-100 text-brand-700">
        <Icon className="size-4.5" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-zinc-600">{desc}</p>
    </button>
  );
}
