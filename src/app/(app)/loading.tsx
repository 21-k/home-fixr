export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-4 h-6 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="size-9 animate-pulse rounded-full bg-zinc-200" />
              <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
            </div>
            <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
