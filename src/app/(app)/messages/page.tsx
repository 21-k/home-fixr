import Link from "next/link";
import { redirect } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getCurrentProfile } from "@/lib/auth/session";
import { displayName } from "@/lib/display";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { timeAgo } from "@/lib/format";
import { loginHref } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite } from "@/lib/types";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  read_at: string | null;
  created_at: string;
};

/** A photo with no caption still needs to read as something in the list. */
function preview(m: Message): string {
  if (m.body) return m.body;
  if (m.attachment_name) {
    return `${m.attachment_type?.startsWith("image/") ? "Photo" : "File"} · ${m.attachment_name}`;
  }
  return "";
}

export default async function MessagesPage() {
  const me = await getCurrentProfile();
  if (!me) redirect(loginHref("/messages"));

  const supabase = await createClient();
  const { data: msgData } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
    .order("created_at", { ascending: false });
  const messages = (msgData ?? []) as Message[];

  // Group into conversations by the other participant.
  const convos = new Map<string, { last: Message; unread: number }>();
  for (const m of messages) {
    const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
    if (!convos.has(other)) convos.set(other, { last: m, unread: 0 });
    if (m.recipient_id === me.id && !m.read_at) convos.get(other)!.unread++;
  }

  const otherIds = [...convos.keys()];
  const profilesById = new Map<string, AuthorLite>();
  if (otherIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select(AUTHOR_COLS)
      .in("id", otherIds);
    for (const p of (profs ?? []) as AuthorLite[]) profilesById.set(p.id, p);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-5 text-xl font-semibold">Messages</h1>
      {otherIds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No conversations yet. Open a member&apos;s profile and hit{" "}
          <span className="font-medium">Send a message</span>.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {otherIds.map((id) => {
            const c = convos.get(id)!;
            const p = profilesById.get(id);
            return (
              <Link
                key={id}
                href={p ? `/messages/${p.username}` : "#"}
                className="flex items-center gap-3 p-4 hover:bg-zinc-50"
              >
                <Avatar person={p} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{displayName(p)}</span>
                    <span className="text-xs text-zinc-400">
                      {timeAgo(c.last.created_at)}
                    </span>
                  </div>
                  <p className="flex items-center gap-1 truncate text-sm text-zinc-600">
                    {c.last.sender_id === me.id && "You: "}
                    {!c.last.body && c.last.attachment_name && (
                      <Paperclip className="size-3.5 shrink-0 text-zinc-400" />
                    )}
                    {preview(c.last)}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
