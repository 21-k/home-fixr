"use client";

import { useActionState } from "react";
import { requestMentorship, type FormState } from "@/lib/actions";
import type { MentorAvailability, MentorshipStatus } from "@/lib/types";

const initial: FormState = {};

/**
 * Rendered on a senior's profile for a logged-in viewer. Reflects the current
 * mentorship state between the viewer (junior) and this senior (mentor).
 */
export function MentorshipButton({
  seniorId,
  username,
  status,
  availability = "accepting",
}: {
  seniorId: string;
  username: string;
  status: MentorshipStatus | null;
  availability?: MentorAvailability;
}) {
  const [state, formAction, pending] = useActionState(requestMentorship, initial);

  if (status === "active") {
    return (
      <span className="rounded-lg bg-success-bg px-3.5 py-2 text-sm font-medium text-success-fg">
        ✓ Your mentor
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-500">
        Request sent
      </span>
    );
  }

  if (availability === "not_accepting") {
    return (
      <span className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-500">
        Not accepting mentorship requests
      </span>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="senior_id" value={seniorId} />
      <input type="hidden" name="username" value={username} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "Requesting…" : "Request mentorship"}
      </button>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
