import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border border-emerald-900 bg-emerald-900 text-white shadow-sm hover:bg-emerald-950 focus-visible:outline-emerald-800",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 focus-visible:outline-emerald-800",
  ghost:
    "border border-transparent text-zinc-700 hover:bg-zinc-100 focus-visible:outline-emerald-800"
};

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; variant?: ButtonVariant }) {
  return (
    <a
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        buttonVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}
