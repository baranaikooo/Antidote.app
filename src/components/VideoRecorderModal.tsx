import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, SwitchCamera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useHaptic } from "@/hooks/use-haptics";
import {
  attachStreamToVideo,
  cameraErrorMessage,
  openCamera,
  recordStreamForMs,
  stopStream,
} from "@/lib/media";

type RecorderPhase = "preview" | "recording" | "review" | "saving";

type CapturedClip = {
  blob: Blob;
  url: string;
  facingMode: "user" | "environment";
};

/** Fullscreen Antidote-styled 3s portrait camera modal shared across onboarding and profile. */
export function VideoRecorderModal({
  slotIndex,
  title = "Moment do profilu",
  onCapture,
  onClose,
}: {
  slotIndex: number | null;
  title?: string;
  onCapture: (slotIndex: number, blob: Blob) => Promise<void> | void;
  onClose: () => void;
}) {
  const haptic = useHaptic();
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [phase, setPhase] = useState<RecorderPhase>("preview");
  const [cameraReady, setCameraReady] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clip, setClip] = useState<CapturedClip | null>(null);
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef(0);
  const recordingRef = useRef(false);
  const clipUrlRef = useRef<string | null>(null);
  const onCaptureRef = useRef(onCapture);
  const onCloseRef = useRef(onClose);
  onCaptureRef.current = onCapture;
  onCloseRef.current = onClose;

  const revokeClip = useCallback(() => {
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
    setClip(null);
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    recordingRef.current = false;
    setStream((current) => {
      stopStream(current);
      return null;
    });
    revokeClip();
    setSaveError("");
    onCloseRef.current();
  }, [revokeClip]);

  // Reset modal state whenever opened for a slot.
  useEffect(() => {
    if (slotIndex === null) return;
    setPhase("preview");
    setSecondsLeft(3);
    setSaveError("");
    revokeClip();
    setAttempt((a) => a + 1);
  }, [slotIndex, revokeClip]);

  // Acquire uncropped camera stream while in live preview/recording phases.
  useEffect(() => {
    if (slotIndex === null || (phase !== "preview" && phase !== "recording")) return;
    const session = ++sessionRef.current;
    recordingRef.current = false;
    setCameraReady(false);

    let localStream: MediaStream | null = null;
    void openCamera({
      video: { facingMode },
      audio: false,
    })
      .then(async (acquired) => {
        if (sessionRef.current !== session) {
          stopStream(acquired);
          return;
        }
        // Explicitly reset hardware/sensor zoom to widest FOV when supported by Android Camera2.
        const track = acquired.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === "function") {
          try {
            const caps = track.getCapabilities() as MediaTrackCapabilities & {
              zoom?: { min?: number; max?: number };
            };
            if (caps.zoom && typeof caps.zoom.min === "number") {
              await track.applyConstraints({
                advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet],
              });
            }
          } catch {
            // Optional zoom reset is ignored on devices without zoom capability.
          }
        }
        if (sessionRef.current !== session) {
          stopStream(acquired);
          return;
        }
        localStream = acquired;
        setStream(acquired);
      })
      .catch((err) => {
        if (sessionRef.current !== session) return;
        console.error("[camera] openCamera failed:", err);
        toast.error(cameraErrorMessage(err));
        onCloseRef.current();
      });

    return () => {
      sessionRef.current += 1;
      stopStream(localStream);
      setStream(null);
    };
  }, [slotIndex, facingMode, phase, attempt]);

  useEffect(() => {
    if (slotIndex === null || !stream || !videoRef.current) return;
    void attachStreamToVideo(videoRef.current, stream);
  }, [slotIndex, stream]);

  // Visual 3s countdown tick during recording.
  useEffect(() => {
    if (phase !== "recording") return;
    setSecondsLeft(3);
    const t1 = window.setTimeout(() => setSecondsLeft(2), 1000);
    const t2 = window.setTimeout(() => setSecondsLeft(1), 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase]);

  // Cancel cleanly when backgrounded or pressing Escape.
  useEffect(() => {
    if (slotIndex === null) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        toast.info("Nahrávanie videa sa prerušilo pri prechode na pozadie.");
        cancel();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [slotIndex, cancel]);

  async function startCapture() {
    if (!stream || recordingRef.current || phase !== "preview") return;
    const session = sessionRef.current;
    recordingRef.current = true;
    setSaveError("");
    haptic("medium");
    setPhase("recording");

    try {
      const { blob } = await recordStreamForMs(stream, 3000, "video");
      if (sessionRef.current !== session) return;

      const url = URL.createObjectURL(blob);
      revokeClip();
      clipUrlRef.current = url;
      setClip({ blob, url, facingMode });
      stopStream(stream);
      setStream(null);
      haptic("success");
      setPhase("review");
    } catch (err) {
      if (sessionRef.current !== session) return;
      console.error("[camera] recordStreamForMs failed:", err);
      toast.error("Video sa nepodarilo nahrať. Skús to ešte raz.");
      setPhase("preview");
    } finally {
      recordingRef.current = false;
    }
  }

  async function confirmClip() {
    if (slotIndex === null || !clip || phase !== "review") return;
    setSaveError("");
    setPhase("saving");
    try {
      await onCaptureRef.current(slotIndex, clip.blob);
      haptic("success");
      revokeClip();
      onCloseRef.current();
    } catch (err) {
      console.error("[camera] save failed:", err);
      setSaveError("Video sa nepodarilo uložiť. Skús to znova alebo nahraj nové.");
      setPhase("review");
    }
  }

  function retakeClip() {
    haptic("tap");
    revokeClip();
    setSaveError("");
    setPhase("preview");
    setAttempt((a) => a + 1);
  }

  if (slotIndex === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-state="open"
      className="fixed inset-0 z-[150] flex flex-col justify-between bg-background text-foreground select-none"
    >
      {/* Top safe-area bar matching Antidote conversation header */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          data-camera-cancel="true"
          disabled={phase === "saving"}
          onClick={() => {
            haptic("tap");
            cancel();
          }}
          aria-label="Zavrieť kameru"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-foreground transition-transform active:scale-95 disabled:opacity-40 cursor-pointer"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 text-center">
          <h2 className="truncate font-display text-lg font-bold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">3-sekundový moment bez zvuku</p>
        </div>

        <button
          type="button"
          disabled={phase !== "preview"}
          onClick={() => {
            haptic("tap");
            setFacingMode((m) => (m === "user" ? "environment" : "user"));
          }}
          aria-label={
            facingMode === "user" ? "Prepnúť na zadnú kameru" : "Prepnúť na prednú kameru"
          }
          className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-foreground transition-transform active:scale-95 disabled:opacity-35 cursor-pointer"
        >
          <SwitchCamera className="size-5" aria-hidden="true" />
        </button>
      </header>

      {/* Center framed 3:4 Antidote card viewfinder (object-contain avoids any zoom crop) */}
      <div className="mx-auto flex w-full max-w-[23rem] flex-1 items-center justify-center px-4 py-2 min-h-0">
        <div className="w-full rounded-[1.5rem] bg-card p-2.5 shadow-sm">
          <div className="relative aspect-[3/4] max-h-[58dvh] w-full overflow-hidden rounded-[1.125rem] bg-[#0d101b]">
            {phase === "review" || phase === "saving" ? (
              clip && (
                <video
                  key={clip.url}
                  src={clip.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className={`size-full object-contain ${
                    clip.facingMode === "user" ? "-scale-x-100" : ""
                  }`}
                />
              )
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                onLoadedData={() => setCameraReady(true)}
                className={`size-full object-contain ${
                  facingMode === "user" ? "-scale-x-100" : ""
                }`}
              />
            )}

            {phase === "preview" && !cameraReady && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45">
                <span className="rounded-full bg-card/90 px-3.5 py-1.5 text-sm font-medium text-foreground">
                  Spúšťam kameru…
                </span>
              </div>
            )}

            {phase === "recording" && (
              <>
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-coral px-3 py-1 text-xs font-bold text-coral-foreground shadow">
                  <span className="size-2 animate-pulse rounded-full bg-current" />
                  <span className="tabular-nums">Nahráva sa · {secondsLeft} s</span>
                </div>
                <div
                  className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/25"
                  aria-hidden="true"
                >
                  <div className="h-full w-full origin-left bg-coral animate-[camera-progress_3s_linear_forwards]" />
                </div>
              </>
            )}

            {(phase === "review" || phase === "saving") && (
              <div className="absolute top-3 left-3 rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
                {phase === "saving" ? "Ukladám moment…" : "Náhľad · 3 s"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom safe-area Antidote controls */}
      <footer className="mx-auto w-full max-w-[23rem] shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        {saveError && (
          <p role="alert" className="mb-2 text-center text-sm font-medium text-destructive">
            {saveError}
          </p>
        )}

        {phase === "preview" && (
          <button
            type="button"
            disabled={!cameraReady || !stream}
            onClick={() => void startCapture()}
            className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-coral px-5 font-display text-base font-bold text-coral-foreground transition-transform active:scale-[0.98] disabled:opacity-45 cursor-pointer"
          >
            <Video className="size-5" aria-hidden="true" />
            <span>Nahrať moment (3 s)</span>
          </button>
        )}

        {phase === "recording" && (
          <button
            type="button"
            onClick={() => {
              haptic("warning");
              cancel();
            }}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-muted px-4 text-sm font-semibold text-foreground cursor-pointer"
          >
            Zrušiť nahrávanie
          </button>
        )}

        {(phase === "review" || phase === "saving") && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={phase === "saving"}
              onClick={retakeClip}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:opacity-45 cursor-pointer"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span>Nahrať znova</span>
            </button>
            <button
              type="button"
              disabled={phase === "saving"}
              onClick={() => void confirmClip()}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-coral px-4 font-display text-sm font-bold text-coral-foreground transition-transform active:scale-[0.98] disabled:opacity-55 cursor-pointer"
            >
              <Check className="size-4" aria-hidden="true" />
              <span>{phase === "saving" ? "Ukladám…" : "Použiť video"}</span>
            </button>
          </div>
        )}
      </footer>
    </div>,
    document.body,
  );
}
