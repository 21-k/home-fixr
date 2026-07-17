"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp, type AuthState } from "@/lib/auth/actions";
import type { UserRole } from "@/lib/types";

const initial: AuthState = {};

export default function JoinPage() {
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
          href="/login"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100"
        >
          Already a member? Sign in
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          How will you use Home Fixr?
        </h1>
        <p className="mt-2 mb-8 text-sm text-zinc-600">
          Pick the one that fits you best. You can switch later.
        </p>

        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="role" value={role} />

          <div className="grid gap-4 sm:grid-cols-2">
            <RoleCard
              selected={role === "junior"}
              onSelect={() => setRole("junior")}
              icon="🎓"
              title="I'm new to the trade"
              desc="Recent vocational graduate, apprentice, or junior. Looking for guidance, mentors, and a community of pros who've been there."
            />
            <RoleCard
              selected={role === "senior"}
              onSelect={() => setRole("senior")}
              icon="🛠️"
              title="I'm a senior pro"
              desc="5+ years in the trades. Want to mentor newcomers, answer questions, and occasionally team up on jobs."
            />
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="full_name" required placeholder="Marcus Johnson" />
              <Field label="Email" name="email" type="email" required placeholder="you@example.com" />
              <Field label="Password" name="password" type="password" required placeholder="At least 6 characters" />
              <Field label="Region" name="region" placeholder="Newark, NJ" />

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Trade</span>
                <select
                  name="trade"
                  defaultValue=""
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                >
                  <option value="">Choose a trade…</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="hvac">HVAC</option>
                  <option value="electrical">Electrical</option>
                  <option value="other">Other / General</option>
                </select>
              </label>

              {role === "senior" && (
                <>
                  <Field label="Title" name="title" placeholder="Master Plumber" />
                  <Field
                    label="Years of experience"
                    name="years_experience"
                    type="number"
                    placeholder="15"
                  />
                </>
              )}
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
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: string;
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
      <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-100 text-xl text-brand-700">
        {icon}
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
