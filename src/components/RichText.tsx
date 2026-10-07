import Link from "next/link";
import { Fragment } from "react";

// @handle autolinking for post and reply bodies. A mention is "@" + 3–22
// handle characters, not preceded by a letter/digit (so emails don't match).
// Trailing dots are punctuation, not part of the handle.
const MENTION = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{3,22})/g;

export function RichText({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const lead = m[1];
    let handle = m[2];
    const trailing = handle.match(/\.+$/)?.[0] ?? "";
    handle = handle.slice(0, handle.length - trailing.length);
    if (handle.length < 3) continue;
    const at = (m.index ?? 0) + lead.length;
    nodes.push(text.slice(last, at));
    nodes.push(
      <Link key={at} href={`/u/${handle}`} className="font-medium text-brand-600 hover:underline">
        @{handle}
      </Link>,
    );
    last = at + 1 + handle.length;
  }
  nodes.push(text.slice(last));
  return (
    // wrap-anywhere: a long unbroken URL wraps instead of widening the page.
    <p className={`wrap-anywhere ${className ?? ""}`}>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </p>
  );
}
