"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AGE_RANGE_VALUES,
  GENERAL_SKILLS,
  MAX_SKILLS,
  SKILLS_BY_TRADE,
} from "@/lib/skills";
import {
  handleErrorMessage,
  handleFormatError,
  HANDLE_STATUS_COPY,
  type HandleStatus,
} from "@/lib/handles";
import { AVATAR_STYLES, isAvatarIcon, type AvatarStyle } from "@/lib/avatar";
import { FOUNDING_CONTACT_MESSAGE } from "@/lib/founding";
import { CV_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type {
  CollabType,
  DisplayPreference,
  MentorAvailability,
  PostType,
  TradeType,
} from "@/lib/types";

export type FormState = { error?: string; ok?: boolean };

const DISPLAY_PREFS: DisplayPreference[] = ["handle", "first_name_initial", "full_name"];
const AVAILABILITY: MentorAvailability[] = ["accepting", "limited", "not_accepting"];

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Is this member a Founding Community (seeded) account? */
async function contactTarget(supabase: SupabaseServer, profileId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_founding_member, mentor_availability, role")
    .eq("id", profileId)
    .maybeSingle();
  return data as
    | { is_founding_member: boolean; mentor_availability: MentorAvailability; role: string }
    | null;
}

/** Friendly copy for the contact-guard errors raised by migration 0009. */
function contactErrorMessage(err: { message: string; hint?: string | null }): string {
  if (err.hint === "founding_member") return FOUNDING_CONTACT_MESSAGE;
  if (err.hint === "mentor_not_accepting") return "This mentor isn't taking new mentees right now.";
  return err.message;
}

/**
 * Live availability check for the handle field. Format is checked here first
 * so obviously-bad input never hits the database.
 */
export async function checkHandleAvailability(handle: string): Promise<HandleStatus> {
  const h = String(handle ?? "").trim();
  const formatError = handleFormatError(h);
  if (formatError) return formatError;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_handle", { p_handle: h });
  if (error || typeof data !== "string") return "error";
  return (data in HANDLE_STATUS_COPY ? data : "error") as HandleStatus;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function nullableTrade(v: FormDataEntryValue | null): TradeType | null {
  const s = String(v ?? "");
  return s ? (s as TradeType) : null;
}

export async function createPost(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to post." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const type = (String(formData.get("type") ?? "question") as PostType);
  if (!title) return { error: "Add a title for your post." };
  if (!body) return { error: "Add some detail so people can help." };

  const { error } = await supabase.from("posts").insert({
    author_id: user.id,
    type,
    title,
    body,
    trade: nullableTrade(formData.get("trade")),
    region: String(formData.get("region") ?? "").trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/feed");
  return { ok: true };
}

export async function createReply(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to reply." };

  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId) return { error: "Missing post." };
  if (!body) return { error: "Write something first." };

  const { error } = await supabase
    .from("replies")
    .insert({ post_id: postId, author_id: user.id, body });
  if (error) return { error: error.message };

  revalidatePath("/q/[slug]", "page");
  return { ok: true };
}

export async function createCollab(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to post a collab." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const type = (String(formData.get("type") ?? "extra_hand") as CollabType);
  if (!title) return { error: "Give your collab a title." };
  if (!body) return { error: "Add some detail about the work." };

  const scheduled = String(formData.get("scheduled_date") ?? "").trim();
  const { error } = await supabase.from("job_collabs").insert({
    poster_id: user.id,
    type,
    title,
    body,
    trade: nullableTrade(formData.get("trade")),
    location: String(formData.get("location") ?? "").trim() || null,
    scheduled_date: scheduled || null,
    pay_type: String(formData.get("pay_type") ?? "").trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/collabs");
  return { ok: true };
}

// --- Small button actions (RPCs that need to bypass row-owner RLS) ---

export async function acceptReply(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const replyId = String(formData.get("reply_id") ?? "");
  await supabase.rpc("accept_reply", { p_reply_id: replyId });
  revalidatePath("/q/[slug]", "page");
}

export async function markPostHelpful(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const postId = String(formData.get("post_id") ?? "");
  await supabase.rpc("mark_post_helpful", { p_post_id: postId });
  revalidatePath("/q/[slug]", "page");
  revalidatePath("/feed");
}

export async function markReplyHelpful(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const replyId = String(formData.get("reply_id") ?? "");
  await supabase.rpc("mark_reply_helpful", { p_reply_id: replyId });
  revalidatePath("/q/[slug]", "page");
}

// --- Job collabs: expressing / withdrawing / responding to interest ---
// (collab_interests table added in migrations/0004)

/**
 * Raise or lower your hand on a collab. The unique (collab_id, user_id)
 * constraint makes this idempotent, and a DB trigger recomputes
 * job_collabs.interested_count from the rows — so double-clicking can no
 * longer inflate the count the way the old counter-bumping RPC did.
 */
export async function toggleCollabInterest(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const collabId = String(formData.get("collab_id") ?? "");
  if (!collabId) return;
  const isInterested = String(formData.get("is_interested") ?? "") === "true";

  if (isInterested) {
    // Grab any attached CV first so withdrawing doesn't orphan the file.
    const { data: existing } = await supabase
      .from("collab_interests")
      .select("cv_path")
      .eq("collab_id", collabId)
      .eq("user_id", user.id)
      .maybeSingle();

    await supabase
      .from("collab_interests")
      .delete()
      .eq("collab_id", collabId)
      .eq("user_id", user.id);

    if (existing?.cv_path) {
      await supabase.storage.from(CV_BUCKET).remove([existing.cv_path]);
    }
  } else {
    const note = String(formData.get("note") ?? "").trim();
    const { data: collab } = await supabase
      .from("job_collabs")
      .select("poster_id")
      .eq("id", collabId)
      .maybeSingle();
    if (!collab) return;
    const poster = await contactTarget(supabase, collab.poster_id);
    // Founding Community postings have no human behind them (DB blocks it too).
    if (poster?.is_founding_member) return;
    // RLS also blocks expressing interest in your own posting.
    await supabase
      .from("collab_interests")
      .insert({ collab_id: collabId, user_id: user.id, note: note || null });
  }

  revalidatePath("/collabs");
  revalidatePath("/collabs/mine");
}

/**
 * Submit (or revise) a job application: a short pitch plus an optional CV.
 *
 * The file itself is uploaded straight from the browser to Storage — Server
 * Actions cap request bodies at 1MB by default and Vercel's function limit is
 * ~4.5MB, so routing a CV through here would be fragile. We only receive the
 * resulting object key.
 *
 * Called imperatively from the client (after the upload finishes) rather than
 * via useActionState, hence the single-argument signature.
 */
export async function applyToCollab(formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to apply." };

  const collabId = String(formData.get("collab_id") ?? "");
  if (!collabId) return { error: "Missing job." };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Add a short note so the poster knows why you." };
  if (note.length > 1500) return { error: "Keep your note under 1500 characters." };

  const cvPath = String(formData.get("cv_path") ?? "").trim();
  const cvName = String(formData.get("cv_name") ?? "").trim();

  // Never trust a client-supplied object key: the poster-read storage policy
  // grants access to whatever path is stored here, so a crafted value could
  // otherwise expose another member's file. Uploads live under "<user_id>/".
  if (cvPath && !cvPath.startsWith(`${user.id}/`)) {
    return { error: "That attachment isn't yours." };
  }

  const { data: collab } = await supabase
    .from("job_collabs")
    .select("poster_id")
    .eq("id", collabId)
    .maybeSingle();
  if (!collab) return { error: "That job is no longer posted." };
  if (collab.poster_id === user.id) {
    return { error: "This is your own posting." };
  }
  const poster = await contactTarget(supabase, collab.poster_id);
  if (poster?.is_founding_member) return { error: FOUNDING_CONTACT_MESSAGE };

  // --- Optional application detail (migration 0008) ---

  const intOrNull = (raw: FormDataEntryValue | null): number | null => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  };

  const years = intOrNull(formData.get("years_experience"));
  if (years !== null && (Number.isNaN(years) || years < 0 || years > 70)) {
    return { error: "Years in the trade should be a number between 0 and 70." };
  }

  const gradYear = intOrNull(formData.get("graduation_year"));
  if (gradYear !== null && (Number.isNaN(gradYear) || gradYear < 1950 || gradYear > 2100)) {
    return { error: "Graduation year doesn't look right." };
  }

  const ageRaw = String(formData.get("age_range") ?? "").trim();
  if (ageRaw && !AGE_RANGE_VALUES.includes(ageRaw as (typeof AGE_RANGE_VALUES)[number])) {
    return { error: "Pick an age range from the list." };
  }

  // Only accept skills from the curated list — free-text values arriving here
  // would be a crafted request, not something the form can produce.
  const allowedSkills = new Set([
    ...Object.values(SKILLS_BY_TRADE).flat(),
    ...GENERAL_SKILLS,
  ]);
  const skills = formData
    .getAll("skills")
    .map((s) => String(s))
    .filter((s) => allowedSkills.has(s))
    .slice(0, MAX_SKILLS);

  const licenseNote = String(formData.get("license_note") ?? "").trim();
  if (licenseNote.length > 120) {
    return { error: "Keep the licence note short." };
  }

  const { error } = await supabase.from("collab_interests").upsert(
    {
      collab_id: collabId,
      user_id: user.id,
      note,
      years_experience: years,
      graduation_year: gradYear,
      age_range: ageRaw || null,
      skills: skills.length ? skills : null,
      is_licensed: formData.get("is_licensed") === "on",
      license_note: licenseNote || null,
      has_own_tools: formData.get("has_own_tools") === "on",
      has_transport: formData.get("has_transport") === "on",
      ...(cvPath ? { cv_path: cvPath, cv_name: cvName || "CV" } : {}),
    },
    { onConflict: "collab_id,user_id" },
  );
  if (error) return { error: contactErrorMessage(error) };

  revalidatePath("/collabs");
  revalidatePath("/collabs/mine");
  return { ok: true };
}

/** The poster accepts or declines one person's interest. */
export async function respondToCollabInterest(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(formData.get("interest_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "accepted" && decision !== "declined")) return;

  // RLS restricts this update to rows on collabs the caller posted.
  await supabase.from("collab_interests").update({ status: decision }).eq("id", id);

  revalidatePath("/collabs/mine");
  revalidatePath("/collabs");
}

// --- Messaging (messages table added in migrations/0002) ---

/**
 * Send a message, optionally with a file or image (migration 0007).
 *
 * Like CVs, attachments upload straight from the browser to Storage and only
 * the object key arrives here — a job-site photo routinely exceeds the 1MB
 * Server Action body cap.
 *
 * Called imperatively from the composer once any upload finishes, so this takes
 * a single argument rather than the useActionState (prev, formData) pair.
 */
export async function sendMessage(formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to send a message." };

  const recipientId = String(formData.get("recipient_id") ?? "");
  const username = String(formData.get("username") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!recipientId || recipientId === user.id)
    return { error: "Invalid recipient." };

  const path = String(formData.get("attachment_path") ?? "").trim();
  const name = String(formData.get("attachment_name") ?? "").trim();
  const type = String(formData.get("attachment_type") ?? "").trim();

  // A photo on its own is a valid message, but something has to be there.
  if (!body && !path) return { error: "Write a message or attach a file." };

  // Never trust a client-supplied object key: the recipient-read storage policy
  // grants access to whatever path is stored on the row, so a crafted value
  // could otherwise leak another member's upload. Keys live under "<user_id>/".
  if (path && !path.startsWith(`${user.id}/`)) {
    return { error: "That attachment isn't yours." };
  }

  const target = await contactTarget(supabase, recipientId);
  if (!target) return { error: "Invalid recipient." };
  if (target.is_founding_member) return { error: FOUNDING_CONTACT_MESSAGE };

  const { error } = await supabase.from("messages").insert({
    sender_id: user.id,
    recipient_id: recipientId,
    body,
    ...(path
      ? { attachment_path: path, attachment_name: name || "Attachment", attachment_type: type || null }
      : {}),
  });
  if (error) return { error: contactErrorMessage(error) };

  revalidatePath("/messages");
  if (username) revalidatePath(`/messages/${username}`);
  return { ok: true };
}

export async function markConversationRead(otherId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user || !otherId) return;
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("sender_id", otherId)
    .is("read_at", null);
  revalidatePath("/messages");
}

// --- Notifications (notifications table + triggers added in migrations/0002) ---

export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
  revalidatePath("/feed");
}

// --- Profile editing (RLS: a user can update only their own row) ---

export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Name can't be empty." };

  const { data: before } = await supabase
    .from("profiles")
    .select("username, username_changed_at, role")
    .eq("id", user.id)
    .single();
  if (!before) return { error: "Profile not found." };

  const handle = parseHandleField(formData, before.username);
  if ("error" in handle) return { error: handle.error };
  const pref = parseDisplayPreference(formData);
  if ("error" in pref) return { error: pref.error };

  const availabilityRaw = String(formData.get("mentor_availability") ?? "");
  const availability = AVAILABILITY.includes(availabilityRaw as MentorAvailability)
    ? (availabilityRaw as MentorAvailability)
    : undefined;

  const yearsRaw = String(formData.get("years_experience") ?? "").trim();
  const update: Record<string, unknown> = {
    full_name: fullName,
    display_preference: pref.value,
    title: String(formData.get("title") ?? "").trim() || null,
    trade: nullableTrade(formData.get("trade")),
    region: String(formData.get("region") ?? "").trim() || null,
    bio: String(formData.get("bio") ?? "").trim() || null,
    years_experience: yearsRaw ? Number(yearsRaw) : null,
    is_open_to_messages: formData.get("is_open_to_messages") === "on",
    is_open_to_ride_alongs: formData.get("is_open_to_ride_alongs") === "on",
  };
  if (handle.changed) update.username = handle.value;
  if (availability && before.role === "senior") update.mentor_availability = availability;

  // Avatar (migration 0011). Only values from the fixed sets are accepted.
  const avatarStyle = String(formData.get("avatar_style") ?? "");
  if (avatarStyle) {
    if (!AVATAR_STYLES.includes(avatarStyle as AvatarStyle)) return { error: "Pick an avatar style." };
    const icon = formData.get("avatar_icon");
    if (avatarStyle === "icon" && !isAvatarIcon(icon)) return { error: "Pick an icon for your avatar." };
    update.avatar_style = avatarStyle;
    update.avatar_icon = avatarStyle === "icon" ? icon : null;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { error: handleErrorMessage(error) };

  // Saving Settings with the auto-derived handle untouched counts as choosing
  // it, so the "pick a handle" nudge goes away (doesn't start the 30-day clock).
  if (!handle.changed && !before.username_changed_at) {
    await supabase.rpc("confirm_current_handle");
  }

  revalidatePath(`/u/${before.username}`);
  if (handle.changed) revalidatePath(`/u/${handle.value}`);
  revalidatePath("/settings");
  revalidatePath("/feed");
  return { ok: true };
}

/** Reads the `username` field; unchanged (case-insensitively) = no update. */
function parseHandleField(
  formData: FormData,
  current: string,
): { value: string; changed: boolean } | { error: string } {
  const raw = formData.get("username");
  if (raw === null) return { value: current, changed: false };
  const value = String(raw).trim();
  const formatError = handleFormatError(value);
  if (formatError) return { error: `Handle: ${HANDLE_STATUS_COPY[formatError]}` };
  return { value, changed: value !== current };
}

function parseDisplayPreference(
  formData: FormData,
): { value: DisplayPreference } | { error: string } {
  const raw = String(formData.get("display_preference") ?? "handle");
  if (!DISPLAY_PREFS.includes(raw as DisplayPreference)) {
    return { error: "Pick how your name should appear." };
  }
  return { value: raw as DisplayPreference };
}

/**
 * The post-signup welcome step (migration 0006). Signup itself only takes name,
 * email, password, and role, so this is where trade, region, and experience get
 * filled in — including `role` for Google users, who never saw our form and
 * were defaulted to 'junior' by the signup trigger.
 *
 * Stamping `onboarded_at` is what stops the prompt from reappearing.
 */
export async function completeOnboarding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in." };

  const role = String(formData.get("role") ?? "");
  if (role !== "junior" && role !== "senior") {
    return { error: "Pick whether you're new to the trade or a senior pro." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const yearsRaw = String(formData.get("years_experience") ?? "").trim();
  const years = yearsRaw ? Number(yearsRaw) : null;
  if (years !== null && (Number.isNaN(years) || years < 0 || years > 70)) {
    return { error: "Years in the trade should be a number between 0 and 70." };
  }

  const { data: before } = await supabase
    .from("profiles")
    .select("username, username_changed_at")
    .eq("id", user.id)
    .single();
  if (!before) return { error: "Profile not found." };

  const handle = parseHandleField(formData, before.username);
  if ("error" in handle) return { error: handle.error };
  const pref = parseDisplayPreference(formData);
  if ("error" in pref) return { error: pref.error };

  const update: Record<string, unknown> = {
    role,
    trade: nullableTrade(formData.get("trade")),
    region: String(formData.get("region") ?? "").trim() || null,
    title: String(formData.get("title") ?? "").trim() || null,
    years_experience: years,
    display_preference: pref.value,
    onboarded_at: new Date().toISOString(),
  };
  // Only overwrite the name if they actually typed one — Google already gave us
  // a good value and we don't want a blank field wiping it.
  if (fullName) update.full_name = fullName;
  if (handle.changed) update.username = handle.value;

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { error: handleErrorMessage(error) };

  // Keeping the suggested/auto handle in this step is still a choice.
  if (!handle.changed && !before.username_changed_at) {
    await supabase.rpc("confirm_current_handle");
  }

  revalidatePath("/feed");
  revalidatePath("/settings");
  redirect("/feed");
}

/** Lets someone dismiss the welcome step and fill their profile in later. */
export async function skipOnboarding(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/feed");
  redirect("/feed");
}

// --- Delete own content (RLS: author-only delete policies) ---

export async function deletePost(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const id = String(formData.get("post_id") ?? "");
  await supabase.from("posts").delete().eq("id", id).eq("author_id", user.id);
  revalidatePath("/feed");
  redirect("/feed");
}

export async function deleteReply(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const id = String(formData.get("reply_id") ?? "");
  await supabase.from("replies").delete().eq("id", id).eq("author_id", user.id);
  revalidatePath("/q/[slug]", "page");
}

// --- Follow / unfollow (follows table added in migrations/0002) ---

export async function toggleFollow(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to follow people." };

  const targetId = String(formData.get("target_id") ?? "");
  const username = String(formData.get("username") ?? "");
  const isFollowing = String(formData.get("is_following") ?? "") === "true";
  if (!targetId || targetId === user.id) return { error: "Can't follow that." };

  const { error } = isFollowing
    ? await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetId)
    : await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetId });

  if (error) return { error: error.message };
  if (username) revalidatePath(`/u/${username}`);
  return { ok: true };
}

// --- Mentorship: junior requests a senior; senior accepts or declines ---

export async function requestMentorship(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to request mentorship." };

  const seniorId = String(formData.get("senior_id") ?? "");
  const username = String(formData.get("username") ?? "");
  if (!seniorId) return { error: "Missing mentor." };
  if (seniorId === user.id) return { error: "You can't mentor yourself." };

  const mentor = await contactTarget(supabase, seniorId);
  if (!mentor || mentor.role !== "senior") return { error: "Missing mentor." };
  if (mentor.is_founding_member) return { error: FOUNDING_CONTACT_MESSAGE };
  if (mentor.mentor_availability === "not_accepting") {
    return { error: "This mentor isn't taking new mentees right now." };
  }

  // Upsert to (re)open a request. RLS lets a user write rows where they are the
  // junior; the unique (junior_id, senior_id) constraint makes this idempotent.
  const { error } = await supabase
    .from("mentorships")
    .upsert(
      { junior_id: user.id, senior_id: seniorId, status: "pending" },
      { onConflict: "junior_id,senior_id" },
    );
  if (error) return { error: contactErrorMessage(error) };

  if (username) revalidatePath(`/u/${username}`);
  revalidatePath("/mentorships");
  revalidatePath("/feed");
  return { ok: true };
}

export async function respondToMentorship(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(formData.get("mentorship_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "active" && decision !== "declined")) return;

  // RLS restricts the update to rows where the caller is the senior (or junior);
  // we additionally scope by senior_id so only the mentor can accept/decline.
  await supabase
    .from("mentorships")
    .update({ status: decision })
    .eq("id", id)
    .eq("senior_id", user.id);

  revalidatePath("/mentorships");
  revalidatePath("/feed");
}
