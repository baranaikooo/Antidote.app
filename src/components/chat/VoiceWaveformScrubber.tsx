import { useRef } from "react";

/** Accessible 44px+ touch-friendly audio waveform scrubber with pointer drag and keyboard seek. */
export function VoiceWaveformScrubber({
  peaks,
  progress,
  label,
  disabled = false,
  tone = "accent",
  onSeek,
}: {
  peaks: number[];
  progress: number;
  label: string;
  disabled?: boolean;
  tone?: "accent" | "coral";
  onSeek: (ratio: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  function seekAtClientX(clientX: number) {
    const track = trackRef.current;
    if (!track || disabled) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={`flex min-h-12 flex-1 touch-none items-center gap-[3px] rounded-lg px-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        disabled ? "cursor-default opacity-60" : "cursor-pointer"
      }`}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekAtClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        seekAtClientX(event.clientX);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const step = 0.05;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onSeek(Math.min(1, clamped + step));
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onSeek(Math.max(0, clamped - step));
        } else if (event.key === "Home") {
          event.preventDefault();
          onSeek(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onSeek(1);
        }
      }}
    >
      {peaks.map((amp, idx) => {
        const barThreshold = (idx + 0.5) / peaks.length;
        const lit = clamped > 0 && barThreshold <= clamped;
        return (
          <span
            key={idx}
            aria-hidden="true"
            className={`flex-1 rounded-full transition-colors ${
              lit ? (tone === "coral" ? "bg-coral" : "bg-accent") : "bg-foreground/25"
            }`}
            style={{ height: `${Math.round(6 + Math.min(1, Math.max(0.16, amp)) * 22)}px` }}
          />
        );
      })}
    </div>
  );
}
