"use client";

import { useActionState, useRef, useState } from "react";
import { createPost, type FormState } from "@/lib/actions";
import { Avatar, type AvatarPerson } from "@/components/Avatar";

const initial: FormState = {};

export function PostComposer({ me }: { me: AvatarPerson }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Close + clear on success inside the action itself rather than in an
  // effect watching state.ok (react-hooks/set-state-in-effect).
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await createPost(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    initial,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <div className="flex items-center gap-2.5">
        <Avatar person={me} size="md" />
        <input
          name="title"
          required
          onFocus={() => setOpen(true)}
          placeholder="Got a question for the pros?"
          className="flex-1 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Post
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Share the details so people can actually help…"
            className="w-full resize-y rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="type"
              defaultValue="question"
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="question">Question</option>
              <option value="tip">Tip from a pro</option>
              <option value="discussion">Discussion</option>
            </select>
            <select
              name="trade"
              defaultValue=""
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">Any trade</option>
              <option value="plumbing">Plumbing</option>
              <option value="hvac">HVAC</option>
              <option value="electrical">Electrical</option>
              <option value="other">General</option>
            </select>
            <input
              name="region"
              placeholder="Region (optional)"
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.error && (
        <p className="mt-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
