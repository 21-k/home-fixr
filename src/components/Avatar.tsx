import Link from "next/link";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

export function Avatar({
  initials,
  size = "md",
  href,
}: {
  initials: string;
  size?: keyof typeof SIZES;
  href?: string;
}) {
  const base = `grid shrink-0 place-items-center rounded-full bg-brand-200 font-semibold text-brand-700 ${SIZES[size]}`;

  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition-transform hover:scale-105 hover:outline-2 hover:outline-brand-300`}
      >
        {initials}
      </Link>
    );
  }
  return <span className={base}>{initials}</span>;
}
