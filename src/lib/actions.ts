"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CV_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { CollabType, PostType, TradeType } from "@/lib/types";

export type FormState = { error?: string; ok?: boolean };

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

  const { error } = await supabase.from("collab_interests").upsert(
    {
      collab_id: collabId,
      user_id: user.id,
      note,
      ...(cvPath ? { cv_path: cvPath, cv_name: cvName || "CV" } : {}),
    },
    { onConflict: "collab_id,user_id" },
  );
  if (error) return { error: error.message };

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

export async function sendMessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Please sign in to send a message." };

  const recipientId = String(formData.get("recipient_id") ?? "");
  const username = String(formData.get("username") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!recipientId || recipientId === user.id)
    return { error: "Invalid recipient." };
  if (!body) return { error: "Write a message first." };

  const { error } = await supabase
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipientId, body });
  if (error) return { error: error.message };

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

  const yearsRaw = String(formData.get("years_experience") ?? "").trim();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      title: String(formData.get("title") ?? "").trim() || null,
      trade: nullableTrade(formData.get("trade")),
      region: String(formData.get("region") ?? "").trim() || null,
      bio: String(formData.get("bio") ?? "").trim() || null,
      years_experience: yearsRaw ? Number(yearsRaw) : null,
      is_open_to_messages: formData.get("is_open_to_messages") === "on",
      is_open_to_ride_alongs: formData.get("is_open_to_ride_alongs") === "on",
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  const { data: prof } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  if (prof?.username) revalidatePath(`/u/${prof.username}`);
  revalidatePath("/settings");
  revalidatePath("/feed");
  return { ok: true };
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

  // Upsert to (re)open a request. RLS lets a user write rows where they are the
  // junior; the unique (junior_id, senior_id) constraint makes this idempotent.
  const { error } = await supabase
    .from("mentorships")
    .upsert(
      { junior_id: user.id, senior_id: seniorId, status: "pending" },
      { onConflict: "junior_id,senior_id" },
    );
  if (error) return { error: error.message };

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
