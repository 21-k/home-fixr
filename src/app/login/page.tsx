import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
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
