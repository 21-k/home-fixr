"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { sendMessage, type FormState } from "@/lib/actions";
import {
  MESSAGE_ACCEPT,
  MESSAGE_BUCKET,
  checkMessageFile,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

/**
 * The message composer: text, emoji, and one file or image per message.
 *
 * Attachments upload browser-to-Storage under "<user_id>/…" (Storage RLS
 * enforces that prefix) and only the object key goes to the Server Action —
 * a phone photo would blow straight past the 1MB action body cap.
 */
export function MessageComposer({
  senderId,
  recipientId,
  username,
}: {
  senderId: string;
  recipientId: string;
  username: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    if (!chosen) return clearFile();

    const problem = checkMessageFile(chosen);
    if (problem) {
      setState({ error: problem });
      clearFile();
      return;
    }
    setState({});
    setFile(chosen);
    setPreview(chosen.type.startsWith("image/") ? URL.createObjectURL(chosen) : null);
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current;
    if (!el) return;
    // Insert at the caret rather than appending, so emoji can go mid-sentence.
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    el.focus();
    el.selectionStart = el.selectionEnd = start + emoji.length;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.delete("attachment_file"); // the bytes never go through the action

    const body = String(formData.get("body") ?? "").trim();
    if (!body && !file) {
      setState({ error: "Write a message or attach a file." });
      return;
    }

    setPending(true);
    setState({});

    try {
      if (file) {
        const supabase = createClient();
        const ext = file.name.includes(".")
          ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
          : "bin";
        const path = `${senderId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(MESSAGE_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setState({ error: `Couldn't upload that file: ${upErr.message}` });
          setPending(false);
          return;
        }
        formData.set("attachment_path", path);
        formData.set("attachment_name", file.name);
        formData.set("attachment_type", file.type);
      }

      const result = await sendMessage(formData);
      if (result.error) {
        setState(result);
        setPending(false);
        return;
      }

      form.reset();
      clearFile();
      setPending(false);
      router.refresh();
    } catch {
      setState({ error: "Something went wrong sending that. Try again." });
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="border-t border-zinc-200 bg-white p-3"
    >
      <input type="hidden" name="recipient_id" value={recipientId} />
      <input type="hidden" name="username" value={username} />

      {file && (
        <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
            <img
              src={preview}
              alt=""
              className="size-12 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded bg-white text-zinc-400 ring-1 ring-zinc-200">
              <FileText className="size-5" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-700">
            {file.name}
          </span>
          <button
            type="button"
            onClick={clearFile}
            aria-label="Remove attachment"
            disabled={pending}
            className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <EmojiPicker onPick={insertEmoji} />

        <label
          aria-label="Attach a file or image"
          className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Paperclip className="size-4.5" />
          <input
            ref={fileRef}
            type="file"
            name="attachment_file"
            accept={MESSAGE_ACCEPT}
            onChange={pickFile}
            className="hidden"
          />
        </label>

        <textarea
          ref={textRef}
          name="body"
          rows={1}
          placeholder="Write a message…"
          className="min-h-[40px] flex-1 resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />

        <button
          type="submit"
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? "Sending…" : "Send"}
        </button>
      </div>

      {state.error && <p className="mt-2 text-xs text-red-700">{state.error}</p>}
      <p className="mt-1.5 text-[11px] text-zinc-400">
        Images, PDFs, and Word docs up to 10MB.
      </p>
    </form>
  );
}
