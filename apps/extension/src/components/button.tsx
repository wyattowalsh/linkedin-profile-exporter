import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variant === "primary" &&
          "bg-[#225c4a] text-white shadow-[0_10px_24px_-18px_rgba(20,84,63,0.75)] hover:bg-[#194f3f] focus-visible:outline-[#225c4a]",
        variant === "secondary" &&
          "border border-[#cbd8d1] bg-white text-[#17201b] shadow-[0_8px_20px_-18px_rgba(23,32,27,0.45)] hover:bg-[#eef8f4] focus-visible:outline-[#225c4a]",
        variant === "ghost" && "text-[#225c4a] hover:bg-[#eef8f4] focus-visible:outline-[#225c4a]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
