"use client";

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/lib/actions";

/** Clears the unread notification badge once the page is viewed. */
export function MarkAllRead() {
  useEffect(() => {
    markAllNotificationsRead();
  }, []);
  return null;
}
