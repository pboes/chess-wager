import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Crowns currency symbol — a monochrome crown glyph used like "$" right
 * before the amount. Sizes to the surrounding text (1em) so it reads as a unit,
 * not an icon. Use for personal-mode (Crowns) amounts; gCRC keeps its word.
 */
export function Crowns({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", className)}>
      <Crown className="h-[1em] w-[1em] shrink-0" aria-hidden />
      {value}
      <span className="sr-only"> Crowns</span>
    </span>
  );
}
