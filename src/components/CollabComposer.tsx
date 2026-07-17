"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCollab, type FormState } from "@/lib/actions";

const initial: FormState = {};
const inputCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

export function CollabComposer() {
  const [state, formAction, pending] = useActionState(createCollab, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        + Post a collab
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full rounded-xl border border-zinc-200 bg-white p-5"
    >
      <h3 className="mb-3 font-semibold">Post a collab</h3>
      <div className="flex flex-col gap-3">
        <input name="title" required placeholder="Title (e.g. Need a 2nd hand Saturday)" className={inputCls} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Describe the work, what you need, and what you're offering…"
          className={`${inputCls} resize-y`}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="type" defaultValue="extra_hand" className={`${inputCls} bg-white`}>
            <option value="extra_hand">Need an extra hand</option>
            <option value="ride_along">Junior ride-along</option>
            <option value="specialist">Need a specialist</option>
          </select>
          <select name="trade" defaultValue="" className={`${inputCls} bg-white`}>
            <option value="">Any trade</option>
            <option value="plumbing">Plumbing</option>
            <option value="hvac">HVAC</option>
            <option value="electrical">Electrical</option>
            <option value="other">General</option>
          </select>
          <input name="location" placeholder="Location (e.g. Newark, NJ)" className={inputCls} />
          <input name="scheduled_date" type="date" className={inputCls} />
          <select name="pay_type" defaultValue="" className={`${inputCls} bg-white`}>
            <option value="">Pay: unspecified</option>
            <option value="day_rate">Day rate</option>
            <option value="unpaid">Unpaid (experience)</option>
            <option value="trade">Trade hours</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post collab"}
        </button>
      </div>
    </form>
  );
}
