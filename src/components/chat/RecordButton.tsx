import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Send, Square, Trash2 } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

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
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/20 bg-[#101722]/95 px-4 pt-3 pb-7 text-[#f4efe5] backdrop-blur-md">
      <div className="mx-auto w-full max-w-md">
        {draft ? (
          <div className="space-y-3 animate-fade-up">
            <div className="flex items-center justify-between text-xs text-foreground/60">
              <span>Skontroluj si odpoveď pred odoslaním</span>
              <span className="font-mono">{formatClock(draft.duration)}</span>
            </div>

            <div className="flex items-center gap-3 border border-foreground/25 bg-card px-3.5 py-2.5">
              <button
                type="button"
                onClick={togglePreview}
                aria-label={previewPlaying ? "Pozastaviť ukážku" : "Prehrať ukážku"}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground cursor-pointer"
              >
                {previewPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 translate-x-[1px]" />
                )}
              </button>

              <div className="flex h-8 flex-1 items-center gap-[3px]">
                {draft.peaks.map((peak, idx) => {
                  const ratio = (idx + 1) / draft.peaks.length;
                  const lit = previewProgress > 0 && ratio <= previewProgress;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const el = previewAudioRef.current;
                        if (el && el.duration && Number.isFinite(el.duration)) {
                          el.currentTime = ratio * el.duration;
                        }
                        setPreviewProgress(ratio);
                      }}
                      aria-label={`Posunúť ukážku na ${Math.round(ratio * 100)} %`}
                      className="flex h-full flex-1 items-center justify-center cursor-pointer"
                    >
                      <span
                        className={`w-[3px] rounded-full transition-colors ${
                          lit ? "bg-cerebral" : "bg-foreground/30"
                        }`}
                        style={{ height: `${Math.round(18 + peak * 78)}%` }}
                      />
                    </button>
                  );
                })}
              </div>

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
                onClick={() => {
                  haptic("warning");
                  previewAudioRef.current?.pause();
                  onDiscardDraft?.();
                }}
                className="flex items-center justify-center gap-2 border border-foreground/25 bg-transparent px-4 py-3.5 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/50 hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="size-4" />
                <span>Nahrať znova</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  haptic("send");
                  previewAudioRef.current?.pause();
                  onSendDraft?.();
                }}
                className="tactile-button flex items-center justify-center gap-2 bg-cerebral px-4 py-3.5 font-display text-sm font-bold text-white cursor-pointer"
              >
                <span>Odoslať</span>
                <Send className="size-4" />
              </button>
            </div>
          </div>
        ) : recording ? (
          <div className="space-y-3 animate-fade-up">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-2 font-medium text-cerebral">
                <span className="size-2 animate-pulse rounded-full bg-cerebral" />
                Nahrávaš odpoveď
              </span>
              <span className="font-mono text-foreground/75">
                {formatClock(recLen)} <span className="text-foreground/35">/ 1:00</span>
              </span>
            </div>

            <div
              className="flex h-8 items-center gap-1 border border-foreground/15 bg-card px-3"
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
                    className="flex-1 rounded-full bg-cerebral transition-all duration-100"
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
                className="flex items-center gap-2 border border-foreground/25 px-4 py-3.5 text-sm text-foreground/75 transition-colors hover:border-foreground/50 hover:text-foreground cursor-pointer"
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
                className="tactile-button flex items-center justify-center gap-2 bg-foreground px-5 py-3.5 font-display text-sm font-bold text-background cursor-pointer"
              >
                <Square className="size-3.5 fill-current" />
                <span>Hotovo · vypočuť si</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                haptic("tap");
                onStart();
              }}
              className="tactile-button flex w-full items-center justify-between bg-cerebral px-5 py-4 text-white disabled:opacity-35 cursor-pointer"
            >
              <span className="font-display text-base font-bold">Nahrať hlasovú odpoveď</span>
              <Mic className="size-5" />
            </button>
            <p className="text-center text-[11px] text-foreground/45">
              Pred odoslaním si nahrávku môžeš vypočuť alebo nahrať znova.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
