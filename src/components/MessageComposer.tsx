"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessage, type FormState } from "@/lib/actions";

const initial: FormState = {};

export function MessageComposer({
  recipientId,
  username,
}: {
  recipientId: string;
  username: string;
}) {
  const [state, formAction, pending] = useActionState(sendMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-end gap-2 border-t border-zinc-200 bg-white p-3"
    >
      <input type="hidden" name="recipient_id" value={recipientId} />
      <input type="hidden" name="username" value={username} />
      <textarea
        name="body"
        required
        rows={1}
        placeholder="Write a message…"
        className="min-h-[40px] flex-1 resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "…" : "Send"}
      </button>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
