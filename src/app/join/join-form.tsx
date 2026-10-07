"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GraduationCap, Wrench, type LucideIcon } from "lucide-react";
import { GoogleButton } from "@/components/GoogleButton";
import { signUp, type AuthState } from "@/lib/auth/actions";
import type { UserRole } from "@/lib/types";

const initial: AuthState = {};

export function JoinForm({ next }: { next?: string | null }) {
  const [role, setRole] = useState<UserRole>("junior");
  const [state, formAction, pending] = useActionState(signUp, initial);

  return (
    <div className="min-h-dvh bg-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
            HF
          </span>
          Home Fixr
        </Link>
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100"
        >
          Already a member? Sign in
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          How will you use Home Fixr?
        </h1>
        <p className="mt-2 mb-6 text-sm text-zinc-600">
          Pick the one that fits you best. You can switch later.
        </p>

        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5">
          <GoogleButton label="Sign up with Google" next={next} />
          <p className="mt-2.5 text-center text-[13px] text-zinc-500">
            Fastest way in — we&apos;ll ask about your trade after.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs uppercase tracking-wide text-zinc-400">or</span>
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="role" value={role} />

          <div className="grid gap-4 sm:grid-cols-2">
            <RoleCard
              selected={role === "junior"}
              onSelect={() => setRole("junior")}
              Icon={GraduationCap}
              title="I'm new to the trade"
              desc="Recent vocational graduate, apprentice, or junior. Looking for guidance, mentors, and a community of pros who've been there."
            />
            <RoleCard
              selected={role === "senior"}
              onSelect={() => setRole("senior")}
              Icon={Wrench}
              title="I'm a senior pro"
              desc="5+ years in the trades. Want to mentor newcomers, answer questions, and occasionally team up on jobs."
            />
          </div>

          {/* Deliberately three fields. Trade, region, years, and title are
              asked at /welcome once the user is already signed in — a stranger
              deciding whether to trust us shouldn't face a seven-field form. */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-1 text-base font-semibold">Create your account</h2>
            <p className="mb-4 text-[13px] text-zinc-500">
              That&apos;s all we need — no newsletter, no spam.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="full_name" required placeholder="Marcus Johnson" />
              <Field label="Email" name="email" type="email" required placeholder="you@example.com" />
              <div className="sm:col-span-2">
                <Field label="Password" name="password" type="password" required placeholder="At least 6 characters" />
              </div>
            </div>
          </div>

          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
              {state.message}
            </p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              Joining as{" "}
              <strong>
                {role === "junior" ? "a new entrant" : "a senior pro"}
              </strong>
            </p>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {pending ? "Creating account…" : "Create account →"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
      className={`rounded-xl border-2 p-6 text-left transition-colors ${
        selected
          ? "border-brand-500 bg-brand-50"
          : "border-zinc-200 bg-white hover:border-brand-500"
      }`}
    >
      <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-100 text-brand-700">
        <Icon className="size-5" />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-5 text-zinc-600">{desc}</p>
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
    </label>
  );
}
