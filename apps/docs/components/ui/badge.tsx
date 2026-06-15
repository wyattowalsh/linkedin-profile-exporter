import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Badge({
  children,
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: "default" | "secondary" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-md px-2.5 text-xs font-medium tabular-nums",
        variant === "default" && "bg-emerald-900 text-white",
        variant === "secondary" && "bg-zinc-100 text-zinc-700",
        variant === "outline" && "border border-zinc-200 bg-white text-zinc-700",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
