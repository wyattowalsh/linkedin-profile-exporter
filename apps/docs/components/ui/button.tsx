import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border border-emerald-900 bg-emerald-900 text-white shadow-[0_12px_28px_-22px_rgba(6,78,59,0.8)] hover:bg-emerald-950 focus-visible:outline-emerald-800",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 shadow-[0_10px_24px_-22px_rgba(24,24,27,0.55)] hover:bg-zinc-50 focus-visible:outline-emerald-800",
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
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
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
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-md px-4 text-sm font-medium no-underline transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]",
        buttonVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}
