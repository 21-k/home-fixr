import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-100 px-4 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-500 text-lg font-semibold text-white">
        HF
      </span>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-zinc-600">
        That page doesn&apos;t exist or may have been removed.
      </p>
      <Link
        href="/feed"
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        Back to the feed
      </Link>
    </div>
  );
}
