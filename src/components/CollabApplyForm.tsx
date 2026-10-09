"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Paperclip, X } from "lucide-react";
import { applyToCollab, type FormState } from "@/lib/actions";
import { AGE_RANGES, MAX_SKILLS, skillsForTrade } from "@/lib/skills";
import { CV_ACCEPT, CV_BUCKET, checkCvFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { CollabInterest, TradeType } from "@/lib/types";

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500";

/** The subset of an existing application the form needs in order to prefill. */
export type ExistingApplication = Pick<
  CollabInterest,
  | "note"
  | "cv_name"
  | "years_experience"
  | "graduation_year"
  | "age_range"
  | "skills"
  | "is_licensed"
  | "license_note"
  | "has_own_tools"
  | "has_transport"
>;

/**
 * The job application: a short pitch plus what a poster actually screens on —
 * time in the trade, what you can do, license, tools, transport.
 *
 * Everything except the pitch is optional. The CV uploads straight from the
 * browser to the private `cvs` bucket and only the object key reaches the
 * Server Action, keeping files clear of the 1MB action body cap.
 */
export function CollabApplyForm({
  collabId,
  userId,
  trade,
  defaultYears,
  existing,
  onDone,
  onCancel,
}: {
  collabId: string;
  userId: string;
  trade: TradeType | null;
  /** Falls back to the applicant's profile so they don't retype it. */
  defaultYears?: number | null;
  existing?: ExistingApplication | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [keepExisting, setKeepExisting] = useState(Boolean(existing?.cv_name));
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [ageRange, setAgeRange] = useState<string>(existing?.age_range ?? "undisclosed");
  const fileRef = useRef<HTMLInputElement>(null);

  const options = skillsForTrade(trade);
  const isEditing = Boolean(existing?.note);

  function toggleSkill(skill: string) {
    setSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : prev.length >= MAX_SKILLS
          ? prev
          : [...prev, skill],
    );
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    if (!chosen) return clearFile();
    const problem = checkCvFile(chosen);
    if (problem) {
      setState({ error: problem });
      clearFile();
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
    formData.delete("cv_file"); // the bytes never travel through the action

    try {
      if (file) {
        const supabase = createClient();
        const ext = file.name.includes(".")
          ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
          : "pdf";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(CV_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setState({ error: `Couldn't upload that file: ${upErr.message}` });
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

  const attachmentLabel = file?.name ?? (keepExisting ? existing?.cv_name : null);

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <input type="hidden" name="collab_id" value={collabId} />
      {/* Chips are buttons, so the selections ride along as hidden inputs. */}
      {skills.map((s) => (
        <input key={s} type="hidden" name="skills" value={s} />
      ))}

      <h4 className="text-sm font-semibold">
        {isEditing ? "Update your application" : "Apply"}
      </h4>
      <p className="mt-0.5 mb-3 text-[13px] text-zinc-500">
        Only the person who posted this can see your application.
      </p>

      {/* --- The pitch: the one required field --- */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">
          Short introduction <span className="text-zinc-400">(required)</span>
        </span>
        <textarea
          name="note"
          required
          rows={3}
          maxLength={1500}
          defaultValue={existing?.note ?? ""}
          placeholder="A few lines: who you are, where you are in the trade, and why you're interested."
          className={`${inputCls} w-full resize-y`}
        />
      </label>

      {/* --- Experience --- */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Years in the trade</span>
          <input
            name="years_experience"
            type="number"
            min={0}
            max={70}
            defaultValue={existing?.years_experience ?? defaultYears ?? ""}
            placeholder="2"
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Graduation year</span>
          <input
            name="graduation_year"
            type="number"
            min={1950}
            max={2100}
            defaultValue={existing?.graduation_year ?? ""}
            placeholder="2025"
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Age range</span>
          <select
            name="age_range"
            value={ageRange}
            onChange={(e) => setAgeRange(e.target.value)}
            className={inputCls}
          >
            {AGE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* An under-18 answer has real consequences for the poster, so surface it
          rather than collecting it silently. */}
      {ageRange === "under_18" && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Job sites have age rules, and the poster may need parental consent or
            extra insurance. Mention it in your note — better raised now than on
            the day.
          </span>
        </p>
      )}

      {/* --- Skills --- */}
      <fieldset className="mt-3">
        <legend className="text-[13px] font-medium">
          What can you do?{" "}
          <span className="text-zinc-400">
            ({skills.length}/{MAX_SKILLS} selected)
          </span>
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((skill) => {
            const on = skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSkill(skill)}
                className={`rounded-full border px-2.5 py-1 text-[13px] transition-colors ${
                  on
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-brand-500"
                }`}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* --- Practicalities --- */}
      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <Check name="is_licensed" defaultChecked={existing?.is_licensed ?? false}>
          I hold a license or certification
        </Check>
        <input
          name="license_note"
          maxLength={120}
          defaultValue={existing?.license_note ?? ""}
          placeholder="Which one? e.g. NJ Journeyman Electrician, EPA 608 Type II"
          className={`${inputCls} w-full`}
        />
        <Check name="has_own_tools" defaultChecked={existing?.has_own_tools ?? false}>
          I have my own hand tools
        </Check>
        <Check name="has_transport" defaultChecked={existing?.has_transport ?? false}>
          I can get myself to site
        </Check>
      </div>

      {/* --- Resume --- */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Paperclip className="size-3.5" />
          {attachmentLabel ? "Replace resume" : "Attach a resume (optional)"}
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
          {pending ? "Sending…" : isEditing ? "Update application" : "Send application"}
        </button>
      </div>
    </form>
  );
}

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-zinc-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-zinc-300 accent-brand-500"
      />
      {children}
    </label>
  );
}
