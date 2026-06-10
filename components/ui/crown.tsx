import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Crowns currency symbol — a monochrome crown glyph used like "$". Sizes to
 * the surrounding text (1em) and inherits colour so it reads as a unit, not an
 * icon. With `value` it prefixes an amount ("♛5"); without, it's the bare symbol
 * standing in for the word "Crowns". Use for personal-mode amounts; gCRC keeps
 * its word.
 */
export function Crowns({ value, className }: { value?: number | string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 align-middle tabular-nums", className)}>
      <Crown className="h-[1em] w-[1em] shrink-0" aria-hidden />
      {value != null && <span>{value}</span>}
      <span className="sr-only">{value != null ? " Crowns" : "Crowns"}</span>
    </span>
  );
}
