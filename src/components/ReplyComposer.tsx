"use client";

import { useActionState, useEffect, useRef } from "react";
import { createReply, type FormState } from "@/lib/actions";

const initial: FormState = {};

export function ReplyComposer({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState(createReply, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <h3 className="mb-3 font-semibold">Add your reply</h3>
      <input type="hidden" name="post_id" value={postId} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Share what you'd do…"
        className="w-full resize-y rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
      />
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      <div className="mt-3 text-right">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post reply"}
        </button>
      </div>
    </form>
  );
}
