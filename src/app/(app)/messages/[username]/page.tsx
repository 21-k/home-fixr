import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { MarkRead } from "@/components/MarkRead";
import { MessageComposer } from "@/components/MessageComposer";
import { getCurrentProfile } from "@/lib/auth/session";
import { profileHeadline, timeAgo } from "@/lib/format";
import {
  CV_SIGNED_URL_SECONDS,
  MESSAGE_BUCKET,
  isImageType,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const { data: otherData } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (!otherData) notFound();
  const other = otherData as Profile;

  const { data: msgData } = await supabase
    .from("messages")
    .select(
      "id, sender_id, recipient_id, body, attachment_path, attachment_name, attachment_type, created_at",
    )
    .or(
      `and(sender_id.eq.${me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${me.id})`,
    )
    .order("created_at", { ascending: true });
  const messages = (msgData ?? []) as Message[];

  // Attachments live in a private bucket, so each needs a short-lived signed
  // URL. Storage RLS only signs these for the sender or the recipient.
  const attachmentUrls = new Map<string, string>();
  const paths = messages
    .map((m) => m.attachment_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(MESSAGE_BUCKET)
      .createSignedUrls(paths, CV_SIGNED_URL_SECONDS);
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) attachmentUrls.set(row.path, row.signedUrl);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <MarkRead otherId={other.id} />

      <Link href="/messages" className="mb-3 text-sm text-brand-600 hover:underline">
        ← All messages
      </Link>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-3 border-b border-zinc-200 p-4">
          <Avatar initials={other.avatar_initials} size="md" href={`/u/${other.username}`} />
          <div>
            <Link href={`/u/${other.username}`} className="font-semibold hover:text-brand-500">
              {other.full_name}
            </Link>
            <div className="text-xs text-zinc-600">{profileHeadline(other)}</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              No messages yet — say hello 👋
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === me.id;
              const url = m.attachment_path
                ? attachmentUrls.get(m.attachment_path)
                : undefined;
              return (
                <div key={m.id} className={mine ? "self-end text-right" : "self-start"}>
                  {m.attachment_path && (
                    <div className="mb-1">
                      <Attachment
                        url={url}
                        name={m.attachment_name}
                        type={m.attachment_type}
                        mine={mine}
                      />
                    </div>
                  )}
                  {m.body && (
                    <div
                      className={`inline-block max-w-md rounded-2xl px-3.5 py-2 text-sm ${
                        mine
                          ? "bg-brand-500 text-white"
                          : "bg-zinc-100 text-zinc-900"
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {timeAgo(m.created_at)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <MessageComposer
          senderId={me.id}
          recipientId={other.id}
          username={other.username}
        />
      </div>
    </div>
  );
}

/**
 * A message attachment. Images render inline; anything else becomes a download.
 * `url` is a signed link that expires, so a stale page shows a graceful
 * placeholder rather than a broken image.
 */
function Attachment({
  url,
  name,
  type,
  mine,
}: {
  url: string | undefined;
  name: string | null;
  type: string | null;
  mine: boolean;
}) {
  const label = name ?? "Attachment";

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-[13px] text-zinc-500">
        <FileText className="size-3.5" /> {label} (expired — reload)
      </span>
    );
  }

  if (isImageType(type)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring Supabase URL; the optimizer can't cache it */}
        <img
          src={url}
          alt={label}
          className="max-h-72 max-w-full rounded-xl border border-zinc-200 object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex max-w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium ${
        mine
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
      }`}
    >
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}
