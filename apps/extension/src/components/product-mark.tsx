import { cn } from "../lib/utils";

interface ProductMarkProps {
  className?: string;
  size?: number;
}

export function ProductMark({ className, size = 40 }: ProductMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("block shrink-0", className)}
      height={size}
      src="/icon/128.png"
      style={{ height: size, width: size }}
      width={size}
    />
  );
}
