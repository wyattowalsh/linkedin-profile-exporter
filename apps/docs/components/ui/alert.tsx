import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Alert({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-900/15 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950",
        className
      )}
      role="note"
      {...props}
    >
      {children}
    </div>
  );
}
