import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Send, Square, Trash2 } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";
import { VoiceWaveformScrubber } from "./VoiceWaveformScrubber";

export type VoiceDraft = {
  url: string;
  duration: number;
  peaks: number[];
};

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function RecordButton({
  recording,
  recLen,
  liveLevel = 0,
  draft = null,
  disabled,
  maxSeconds,
  sending = false,
  onStart,
  onCommit,
  onCancel,
  onSendDraft,
  onDiscardDraft,
}: {
  recording: boolean;
  recLen: number;
  liveLevel?: number;
  draft?: VoiceDraft | null;
  disabled: boolean;
  maxSeconds: number;
  sending?: boolean;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onSendDraft?: () => void;
  onDiscardDraft?: () => void;
}) {
  const haptic = useHaptic();
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  useEffect(() => {
    setPreviewPlaying(false);
    setPreviewProgress(0);
  }, [draft?.url]);

  const togglePreview = () => {
    const el = previewAudioRef.current;
    if (!el) return;
    haptic("tap");
    if (previewPlaying) {
      el.pause();
      setPreviewPlaying(false);
    } else {
      if (el.ended) {
        el.currentTime = 0;
        setPreviewProgress(0);
      }
      void el
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => setPreviewPlaying(false));
    }
  };

  return (
    <div className="conversation-composer shrink-0">
      <div className="mx-auto w-full max-w-md px-4 py-3">
        {draft ? (
          <div className="space-y-3 animate-fade-up">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Skontroluj si odpoveď pred odoslaním</span>
              <span className="font-semibold tabular-nums">{formatClock(draft.duration)}</span>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-2">
              <button
                type="button"
                onClick={togglePreview}
                aria-label={previewPlaying ? "Pozastaviť ukážku" : "Prehrať ukážku"}
                className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 cursor-pointer ${
                  previewPlaying ? "bg-coral text-coral-foreground" : "bg-accent text-accent-foreground"
                }`}
              >
                {previewPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 translate-x-[1px]" />
                )}
              </button>

              <VoiceWaveformScrubber
                peaks={draft.peaks}
                progress={previewProgress}
                tone={previewPlaying ? "coral" : "accent"}
                label="Priebeh nahratej ukážky"
                onSeek={(ratio) => {
                  const el = previewAudioRef.current;
                  if (el && el.duration && Number.isFinite(el.duration)) {
                    el.currentTime = ratio * el.duration;
                  }
                  setPreviewProgress(ratio);
                }}
              />

              <audio
                ref={previewAudioRef}
                src={draft.url}
                preload="metadata"
                playsInline
                onTimeUpdate={(e) => {
                  const a = e.currentTarget;
                  if (a.duration && Number.isFinite(a.duration)) {
                    setPreviewProgress(a.currentTime / a.duration);
                  }
                }}
                onEnded={() => {
                  setPreviewPlaying(false);
                  setPreviewProgress(1);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  haptic("warning");
                  previewAudioRef.current?.pause();
                  onDiscardDraft?.();
                }}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="size-4" />
                <span>Zahodiť</span>
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  haptic("send");
                  previewAudioRef.current?.pause();
                  onSendDraft?.();
                }}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 font-display text-sm font-bold text-coral-foreground transition-transform active:scale-[0.98] disabled:opacity-40 cursor-pointer"
              >
                <span>{sending ? "Odosielam…" : "Odoslať"}</span>
                <Send className="size-4" />
              </button>
            </div>
          </div>
        ) : recording ? (
          <div className="space-y-3 animate-fade-up">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-2 font-semibold text-coral">
                <span className="size-2 animate-pulse rounded-full bg-coral" />
                Nahrávaš odpoveď
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatClock(Math.min(recLen, maxSeconds))}{" "}
                <span className="text-muted-foreground">/ {formatClock(maxSeconds)}</span>
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-coral transition-[width] duration-200 ease-linear"
                style={{ width: `${Math.min(100, (recLen / maxSeconds) * 100)}%` }}
              />
            </div>

            <div
              className="flex h-11 items-center gap-1 rounded-2xl bg-muted px-3.5"
              aria-hidden
            >
              {Array.from({ length: 20 }).map((_, idx) => {
                const centerWeight = 1 - Math.abs(9.5 - idx) / 11;
                const barHeight = Math.min(
                  95,
                  Math.max(16, Math.round((0.18 + liveLevel * centerWeight) * 100)),
                );
                return (
                  <span
                    key={idx}
                    className="flex-1 rounded-full bg-coral transition-all duration-100"
                    style={{ height: `${barHeight}%` }}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-2.5">
              <button
                type="button"
                onClick={() => {
                  haptic("warning");
                  onCancel();
                }}
                aria-label="Zahodiť nahrávanie"
                className="flex min-h-12 items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 cursor-pointer"
              >
                <Trash2 className="size-4" />
                <span>Zahodiť</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  haptic("medium");
                  onCommit();
                }}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-coral px-5 py-3 font-display text-sm font-bold text-coral-foreground transition-transform active:scale-[0.98] cursor-pointer"
              >
                <Square className="size-3.5 fill-current" />
                <span>Hotovo · vypočuť si</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                haptic("tap");
                onStart();
              }}
              aria-label="Nahrať hlasovú odpoveď"
              className="grid size-16 place-items-center rounded-full bg-coral text-coral-foreground transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral disabled:opacity-35 cursor-pointer"
            >
              <Mic className="size-6" aria-hidden="true" />
            </button>
            <p className="font-display text-sm font-semibold">Nahrať odpoveď</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Povolíš mikrofón a pred odoslaním si môžeš nahrávku vypočuť.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
