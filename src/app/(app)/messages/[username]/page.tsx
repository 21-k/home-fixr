import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MarkRead } from "@/components/MarkRead";
import { MessageComposer } from "@/components/MessageComposer";
import { getCurrentProfile } from "@/lib/auth/session";
import { profileHeadline, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
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
    .select("id, sender_id, recipient_id, body, created_at")
    .or(
      `and(sender_id.eq.${me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${me.id})`,
    )
    .order("created_at", { ascending: true });
  const messages = (msgData ?? []) as Message[];

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
              return (
                <div key={m.id} className={mine ? "self-end text-right" : "self-start"}>
                  <div
                    className={`inline-block max-w-md rounded-2xl px-3.5 py-2 text-sm ${
                      mine
                        ? "bg-brand-500 text-white"
                        : "bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    {m.body}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {timeAgo(m.created_at)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <MessageComposer recipientId={other.id} username={other.username} />
      </div>
    </div>
  );
}
