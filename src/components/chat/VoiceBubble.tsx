import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";

export type VoiceMsg = {
  id: string;
  from: "me" | "them";
  duration: number;
  audioUrl?: string;
  read?: boolean;
  peaks?: number[];
};

const BAR_COUNT = 24;

function buildFallbackPeaks(seed: string, duration: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: BAR_COUNT }, (_, idx) => {
    const wave = Math.abs(Math.sin((idx + 1) * 0.65 + duration * 0.4 + (hash % 17)));
    const detail = ((hash >>> (idx % 16)) & 7) / 14;
    return Math.min(1, Math.max(0.18, wave * 0.68 + detail * 0.32));
  });
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function VoiceBubble({
  msg,
  playing,
  onToggle,
  onEnded,
}: {
  msg: VoiceMsg;
  playing: boolean;
  onToggle: () => void;
  onEnded: () => void;
}) {
  const mine = msg.from === "me";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.25>(1);
  const [listened, setListened] = useState(Boolean(msg.read));
  const [decodedPeaks, setDecodedPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    try {
      setListened(Boolean(msg.read) || localStorage.getItem(`antidote:voice-listened:${msg.id}`) === "true");
    } catch {
      setListened(Boolean(msg.read));
    }
  }, [msg.id, msg.read]);

  useEffect(() => {
    setDecodedPeaks(null);
    if (msg.peaks?.length || !msg.audioUrl) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const controller = new AbortController();
    const context = new AudioContextClass();

    async function readWaveform() {
      try {
        const response = await fetch(msg.audioUrl!, { signal: controller.signal });
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        const samples = buffer.getChannelData(0);
        const peaks = Array.from({ length: BAR_COUNT }, (_, index) => {
          const start = Math.floor((index * samples.length) / BAR_COUNT);
          const end = Math.floor(((index + 1) * samples.length) / BAR_COUNT);
          let peak = 0;
          for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
          return peak;
        });
        const maximum = Math.max(0.08, ...peaks);
        setDecodedPeaks(peaks.map((peak) => Math.max(0.16, peak / maximum)));
      } catch {
        // Keep the existing fallback waveform when decoding is unavailable.
      } finally {
        void context.close().catch(() => {});
      }
    }

    void readWaveform();
    return () => controller.abort();
  }, [msg.audioUrl, msg.peaks]);

  const bars = useMemo(() => {
    if (msg.peaks && msg.peaks.length > 0) {
      if (msg.peaks.length === BAR_COUNT) return msg.peaks;
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        const sourceIdx = Math.min(
          msg.peaks!.length - 1,
          Math.floor((i / BAR_COUNT) * msg.peaks!.length),
        );
        return Math.min(1, Math.max(0.16, msg.peaks![sourceIdx] ?? 0.3));
      });
    }
    return decodedPeaks ?? buildFallbackPeaks(msg.id, msg.duration);
  }, [msg.id, msg.duration, msg.peaks, decodedPeaks]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
    if (playing) {
      if (el.ended || (el.duration && el.currentTime >= el.duration - 0.05)) {
        el.currentTime = 0;
        setProgress(0);
        setCurrentSec(0);
      }
      void el.play().catch(() => onEndedRef.current());
    } else {
      el.pause();
    }
  }, [playing, speed]);

  const canPlay = Boolean(msg.audioUrl);

  function handleScrub(index: number) {
    if (!canPlay) return;
    const el = audioRef.current;
    const ratio = (index + 0.5) / BAR_COUNT;
    if (el && el.duration && Number.isFinite(el.duration)) {
      el.currentTime = ratio * el.duration;
      setCurrentSec(el.currentTime);
    }
    setProgress(ratio);
    if (!playing) {
      onToggle();
    }
  }

  function toggleSpeed() {
    const next: 1 | 1.25 = speed === 1 ? 1.25 : 1;
    setSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }

  const shownTime =
    playing || currentSec > 0
      ? `${formatClock(currentSec)} / ${formatClock(msg.duration)}`
      : formatClock(msg.duration);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`w-full max-w-[85%] rounded-2xl border px-4 py-3 transition-colors ${
          mine
            ? "border-accent/25 bg-accent/12 text-foreground"
            : "border-foreground/15 bg-card text-foreground"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => canPlay && onToggle()}
            disabled={!canPlay}
            aria-label={playing ? "Pozastaviť hlasovku" : "Prehrať hlasovku"}
            className={`grid size-10 shrink-0 place-items-center rounded-full border transition-transform active:scale-95 disabled:opacity-40 cursor-pointer ${
              playing || mine
                ? "border-accent bg-accent text-accent-foreground"
                : "border-foreground/25 bg-muted text-foreground hover:border-accent"
            }`}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-[1px]" />}
          </button>

          <div className="min-w-0 flex-1">
            <div
              className="flex h-8 touch-none items-center gap-[3px]"
              role="group"
              aria-label="Priebeh hlasovej správy"
              onPointerDown={(event) => {
                if (!canPlay) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const bounds = event.currentTarget.getBoundingClientRect();
                const index = Math.floor(((event.clientX - bounds.left) / bounds.width) * BAR_COUNT);
                handleScrub(Math.max(0, Math.min(BAR_COUNT - 1, index)));
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const index = Math.floor(((event.clientX - bounds.left) / bounds.width) * BAR_COUNT);
                handleScrub(Math.max(0, Math.min(BAR_COUNT - 1, index)));
              }}
            >
              {bars.map((amp, i) => {
                const ratio = (i + 1) / BAR_COUNT;
                const lit = progress > 0 && ratio <= progress;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canPlay}
                    onClick={(event) => {
                      if (event.detail === 0) handleScrub(i);
                    }}
                    aria-label={`Posunúť na ${Math.round(ratio * 100)} %`}
                    className="group flex h-full flex-1 items-center justify-center cursor-pointer disabled:cursor-default"
                  >
                    <span
                      className={`w-[3px] rounded-full transition-colors ${
                        lit
                          ? "bg-cerebral"
                          : playing
                            ? "bg-foreground/35 group-hover:bg-foreground/65"
                            : "bg-foreground/25 group-hover:bg-foreground/55"
                      }`}
                      style={{ height: `${Math.round(18 + amp * 78)}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSpeed}
            aria-label="Rýchlosť prehrávania"
            className="shrink-0 rounded-lg border border-foreground/20 bg-background/60 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground/75 transition-colors hover:border-accent hover:text-foreground cursor-pointer"
          >
            {speed}×
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-foreground/50">
          <span>{mine ? "Tvoja odpoveď" : "Hlasová správa"}</span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {!mine && listened && (
              <span className="inline-flex items-center gap-0.5 text-xs text-accent">
                <Check className="size-3" />
                vypočuté
              </span>
            )}
            <span>{shownTime}</span>
          </span>
        </div>

        {canPlay && (
          <audio
            ref={audioRef}
            src={msg.audioUrl}
            preload="metadata"
            playsInline
            onTimeUpdate={(e) => {
              const a = e.currentTarget;
              setCurrentSec(a.currentTime);
              if (a.duration && Number.isFinite(a.duration)) {
                setProgress(a.currentTime / a.duration);
              }
            }}
            onEnded={() => {
              setProgress(1);
              setCurrentSec(0);
              setListened(true);
              if (!mine) {
                try {
                  localStorage.setItem(`antidote:voice-listened:${msg.id}`, "true");
                } catch {
                  // Playback remains available when local storage is disabled.
                }
              }
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
              }
              onEndedRef.current();
            }}
            onError={() => onEndedRef.current()}
          />
        )}
      </div>
    </div>
  );
}
