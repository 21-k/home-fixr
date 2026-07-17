"use client";

import { useEffect } from "react";
import { markConversationRead } from "@/lib/actions";

/** Marks a conversation's incoming messages as read once, on mount. */
export function MarkRead({ otherId }: { otherId: string }) {
  useEffect(() => {
    markConversationRead(otherId);
  }, [otherId]);
  return null;
}
