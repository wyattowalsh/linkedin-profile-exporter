import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; children: ReactNode }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-[#225c4a] text-white hover:bg-[#194f3f] focus-visible:outline-[#225c4a]",
        variant === "secondary" && "border border-[#cbd8d1] bg-white text-[#17201b] hover:bg-[#eef8f4]",
        variant === "ghost" && "text-[#225c4a] hover:bg-[#eef8f4]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
