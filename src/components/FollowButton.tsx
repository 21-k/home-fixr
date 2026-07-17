"use client";

import { useActionState } from "react";
import { toggleFollow, type FormState } from "@/lib/actions";

const initial: FormState = {};

export function FollowButton({
  profileId,
  username,
  isFollowing = false,
}: {
  profileId: string;
  username: string;
  isFollowing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(toggleFollow, initial);

  return (
    <form action={formAction} className="inline-flex flex-col">
      <input type="hidden" name="target_id" value={profileId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="is_following" value={String(isFollowing)} />
      <button
        type="submit"
        disabled={pending}
        className={
          isFollowing
            ? "rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60"
            : "rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60"
        }
      >
        {pending ? "…" : isFollowing ? "Following ✓" : "Follow"}
      </button>
      {state.error && <span className="mt-1 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
