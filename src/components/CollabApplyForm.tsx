"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { applyToCollab, type FormState } from "@/lib/actions";
import {
  CV_ACCEPT,
  CV_BUCKET,
  checkCvFile,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

/**
 * The short "why me" application, with an optional CV.
 *
 * The file goes straight from the browser to the private `cvs` bucket under
 * "<user_id>/…" (Storage RLS enforces that prefix), and only the resulting
 * object key is handed to the Server Action. That keeps CVs clear of the 1MB
 * Server Action body cap.
 */
export function CollabApplyForm({
  collabId,
  userId,
  existingNote,
  existingCvName,
  onDone,
  onCancel,
}: {
  collabId: string;
  userId: string;
  existingNote?: string | null;
  existingCvName?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [keepExisting, setKeepExisting] = useState(Boolean(existingCvName));
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    if (!chosen) {
      setFile(null);
      return;
    }
    const problem = checkCvFile(chosen);
    if (problem) {
      setState({ error: problem });
      e.target.value = "";
      setFile(null);
      return;
    }
    setState({});
    setFile(chosen);
    setKeepExisting(false);
  }

  function clearFile() {
    setFile(null);
    setKeepExisting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setState({});

    const formData = new FormData(form);
    formData.delete("cv_file"); // the file never travels through the action

    try {
      if (file) {
        const supabase = createClient();
        const ext = file.name.includes(".")
          ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
          : "pdf";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(CV_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          setState({ error: `Couldn't upload that file: ${uploadError.message}` });
          setPending(false);
          return;
        }
        formData.set("cv_path", path);
        formData.set("cv_name", file.name);
      }

      const result = await applyToCollab(formData);
      if (result.error) {
        setState(result);
        setPending(false);
        return;
      }
      onDone();
    } catch {
      setState({ error: "Something went wrong sending that. Try again." });
      setPending(false);
    }
  }

  const attachmentLabel = file?.name ?? (keepExisting ? existingCvName : null);

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <input type="hidden" name="collab_id" value={collabId} />
      <h4 className="mb-2 text-sm font-semibold">
        {existingNote ? "Update your application" : "Apply for this job"}
      </h4>

      <textarea
        name="note"
        required
        rows={3}
        maxLength={1500}
        defaultValue={existingNote ?? ""}
        placeholder="Short pitch — your trade, how far along you are, and why this job. A few lines is plenty."
        className={`${inputCls} w-full resize-y bg-white`}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Paperclip className="size-3.5" />
          {attachmentLabel ? "Replace CV" : "Attach CV (optional)"}
          <input
            ref={fileRef}
            type="file"
            name="cv_file"
            accept={CV_ACCEPT}
            onChange={pickFile}
            className="hidden"
          />
        </label>

        {attachmentLabel && (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-zinc-700 ring-1 ring-zinc-200">
            <span className="truncate">{attachmentLabel}</span>
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove attachment"
              className="text-zinc-400 hover:text-zinc-900"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}

        <span className="text-xs text-zinc-500">PDF, Word, or image · up to 5MB</span>
      </div>

      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? "Sending…" : existingNote ? "Update application" : "Send application"}
        </button>
      </div>
    </form>
  );
}
