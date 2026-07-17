"use server";

import { revalidatePath } from "next/cache";
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

  revalidatePath(`/q/${postId}`);
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
  const postId = String(formData.get("post_id") ?? "");
  await supabase.rpc("accept_reply", { p_reply_id: replyId });
  revalidatePath(`/q/${postId}`);
}

export async function markPostHelpful(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const postId = String(formData.get("post_id") ?? "");
  await supabase.rpc("mark_post_helpful", { p_post_id: postId });
  revalidatePath(`/q/${postId}`);
  revalidatePath("/feed");
}

export async function markReplyHelpful(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const replyId = String(formData.get("reply_id") ?? "");
  const postId = String(formData.get("post_id") ?? "");
  await supabase.rpc("mark_reply_helpful", { p_reply_id: replyId });
  revalidatePath(`/q/${postId}`);
}

export async function expressInterest(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const collabId = String(formData.get("collab_id") ?? "");
  await supabase.rpc("express_collab_interest", { p_collab_id: collabId });
  revalidatePath("/collabs");
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
