import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MarkAllRead } from "@/components/MarkAllRead";
import { getCurrentProfile } from "@/lib/auth/session";
import { displayName } from "@/lib/display";
import { AUTHOR_COLS } from "@/lib/profile-cols";
import { timeAgo } from "@/lib/format";
import { loginHref } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";
import type { AuthorLite } from "@/lib/types";

type NotifType =
  | "reply"
  | "mentorship_request"
  | "mentorship_accepted"
  | "message"
  | "follow"
  | "collab_interest"
  | "collab_accepted";

type Notif = {
  id: string;
  type: NotifType;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: AuthorLite | null;
};

function describe(n: Notif): { text: string; href: string } {
  const name = n.actor ? displayName(n.actor) : "Someone";
  switch (n.type) {
    case "reply":
      return { text: `${name} replied to your post`, href: `/q/${n.entity_id}` };
    case "mentorship_request":
      return { text: `${name} requested your mentorship`, href: "/mentorships" };
    case "mentorship_accepted":
      return { text: `${name} accepted your mentorship request`, href: "/mentorships" };
    case "message":
      return {
        text: `${name} sent you a message`,
        href: n.actor ? `/messages/${n.actor.username}` : "/messages",
      };
    case "follow":
      return {
        text: `${name} followed you`,
        href: n.actor ? `/u/${n.actor.username}` : "/feed",
      };
    case "collab_interest":
      return {
        text: `${name} is interested in your ride-along or collaboration`,
        href: "/collabs/mine",
      };
    case "collab_accepted":
      return {
        text: `${name} accepted your application`,
        href: "/collabs/mine",
      };
    default:
      return { text: "New notification", href: "/feed" };
  }
}

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await getCurrentProfile();
  if (!me) redirect(loginHref("/notifications"));

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(
      `id, type, actor_id, entity_type, entity_id, read_at, created_at, actor:profiles!notifications_actor_id_fkey ( ${AUTHOR_COLS} )`,
    )
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const notifs = (data ?? []) as unknown as Notif[];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <MarkAllRead />
      <h1 className="mb-5 text-xl font-semibold">Notifications</h1>

      {notifs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Nothing yet. Replies, mentorship requests, follows, messages, and
          applications to your ride-alongs and collaborations show up here.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {notifs.map((n) => {
            const { text, href } = describe(n);
            return (
              <Link
                key={n.id}
                href={href}
                className={`flex items-center gap-3 p-4 hover:bg-zinc-50 ${
                  n.read_at ? "" : "bg-brand-50/40"
                }`}
              >
                <Avatar person={n.actor} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{text}</p>
                  <p className="text-xs text-zinc-500">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <span className="size-2 shrink-0 rounded-full bg-brand-500" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
