"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import {
  CollabApplyForm,
  type ExistingApplication,
} from "@/components/CollabApplyForm";
import { CollabFilledToggle } from "@/components/CollabFilled";
import { toggleCollabInterest } from "@/lib/actions";
import { applyBlockReason, COLLAB_FILLED_MESSAGE } from "@/lib/collabs";
import { FOUNDING_CONTACT_MESSAGE } from "@/lib/founding";
import type { CollabInterestStatus, TradeType } from "@/lib/types";

/**
 * The apply / applied / withdraw control on a collab card, plus the button to
 * message the poster directly.
 *
 * Posters see a link to their applicants rather than a button they can't press
 * — Storage and table RLS both reject interest in your own posting — plus
 * Mark as filled / Reopen. A filled job (migration 0013) shows no apply
 * control to anyone; the viewer's own application status still shows.
 */
export function CollabInterestControl({
  collabId,
  userId,
  isOwnPosting,
  status,
  application,
  trade,
  defaultYears,
  posterUsername,
  posterIsFounding = false,
  filled = false,
}: {
  collabId: string;
  userId: string;
  isOwnPosting: boolean;
  status: CollabInterestStatus | undefined;
  /** The caller's own existing application, for prefilling an edit. */
  application: ExistingApplication | null;
  /** Drives which skill checklist the form shows. */
  trade: TradeType | null;
  defaultYears: number | null;
  posterUsername: string | null;
  /** Seeded postings can't be applied to — nobody would read the pitch. */
  posterIsFounding?: boolean;
  /** The poster marked the position filled. */
  filled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const messageLink = posterUsername ? (
    <Link
      href={`/messages/${posterUsername}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
    >
      <MessageSquare className="size-3.5" /> Message
    </Link>
  ) : null;

  const block = applyBlockReason({ isOwnPosting, filled, posterIsFounding });

  if (block === "own") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <Link
          href="/collabs/mine"
          className="text-[13px] font-medium text-brand-600 hover:underline"
        >
          Your posting — see who&apos;s interested
        </Link>
        <div className="ml-auto">
          <CollabFilledToggle collabId={collabId} filled={filled} />
        </div>
      </div>
    );
  }

  if (block === "filled") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        {status === "accepted" && (
          <span className="rounded bg-success-bg px-2 py-1 text-xs font-medium text-success-fg">
            ✓ You&apos;re in
          </span>
        )}
        {status === "declined" && (
          <span className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-500">
            Not this time
          </span>
        )}
        <p className="text-[13px] leading-relaxed text-zinc-600">
          {COLLAB_FILLED_MESSAGE}
          {posterIsFounding && (
            <span className="mt-1 block text-[12px] text-zinc-500">
              {FOUNDING_CONTACT_MESSAGE}
            </span>
          )}
        </p>
        {!posterIsFounding && <div className="ml-auto">{messageLink}</div>}
      </div>
    );
  }

  if (block === "founding") {
    return (
      <p className="mt-3 border-t border-zinc-100 pt-3 text-[13px] leading-relaxed text-zinc-500">
        {FOUNDING_CONTACT_MESSAGE}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "accepted" && (
          <span className="rounded bg-success-bg px-2 py-1 text-xs font-medium text-success-fg">
            ✓ You&apos;re in
          </span>
        )}
        {status === "declined" && (
          <span className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-500">
            Not this time
          </span>
        )}
        {status === "interested" && (
          <span className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-500">
            Applied — awaiting reply
          </span>
        )}

        {!status && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600"
          >
            I&apos;m interested
          </button>
        )}

        {status === "interested" && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-100"
          >
            Edit application
          </button>
        )}

        {status === "interested" && (
          <form action={toggleCollabInterest}>
            <input type="hidden" name="collab_id" value={collabId} />
            <input type="hidden" name="is_interested" value="true" />
            <button className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900">
              Withdraw
            </button>
          </form>
        )}

        <div className="ml-auto">{messageLink}</div>
      </div>

      {open && (
        <CollabApplyForm
          collabId={collabId}
          userId={userId}
          trade={trade}
          defaultYears={defaultYears}
          existing={application}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
