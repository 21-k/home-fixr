"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/auth/actions";

const initial: AuthState = {};

export function LoginForm({ next }: { next?: string | null }) {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
