import { cn } from "@/lib/utils";

type AntidoteLogoProps = {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
};

export function AntidoteLogo({ className, markClassName, showWordmark = true }: AntidoteLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)} aria-label="Antidote">
      <svg
        viewBox="0 0 76 72"
        role="img"
        aria-hidden="true"
        className={cn("h-8 w-auto shrink-0 overflow-visible", markClassName)}
      >
        <path d="M8 62 28.5 10H36L20.5 62Z" fill="currentColor" />
        <path d="M40 10h7.5L68 62H55.5Z" fill="currentColor" />
        <circle cx="38" cy="48" r="4.5" className="fill-cerebral" />
      </svg>
      {showWordmark && (
        <span className="font-display text-xl font-extrabold tracking-[-0.065em]">ANTIDOTE</span>
      )}
    </div>
  );
}
