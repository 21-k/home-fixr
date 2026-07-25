import Link from "next/link";
import { GoogleButton } from "@/components/GoogleButton";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // /auth/callback redirects here with ?error=… when OAuth fails.
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-100 px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <span className="grid size-7 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">
          HF
        </span>
        Home Fixr
      </Link>

      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-600">
          Sign in to the community.
        </p>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <GoogleButton label="Sign in with Google" />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs uppercase tracking-wide text-zinc-400">or</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <LoginForm />
      </div>

      <p className="mt-6 text-sm text-zinc-600">
        New here?{" "}
        <Link href="/join" className="font-medium text-brand-600 hover:underline">
          Join the community
        </Link>
      </p>
    </div>
  );
}
