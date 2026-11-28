import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SwitchCamera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useHaptic } from "@/hooks/use-haptics";
import {
  attachStreamToVideo,
  cameraErrorMessage,
  openCamera,
  recordStreamForMs,
  stopStream,
} from "@/lib/media";

/** Full-screen mobile-friendly 3s portrait camera modal shared across onboarding and profile. */
export function VideoRecorderModal({
  slotIndex,
  title = "Nahrať moment",
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
  const [countdown, setCountdown] = useState(3);
  const [recordingState, setRecordingState] = useState<"countdown" | "recording" | "saving">(
    "countdown",
  );
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef(0);
  const startedSessionRef = useRef<number | null>(null);
  const onCaptureRef = useRef(onCapture);
  const onCloseRef = useRef(onClose);
  onCaptureRef.current = onCapture;
  onCloseRef.current = onClose;

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    startedSessionRef.current = null;
    setStream((current) => {
      stopStream(current);
      return null;
    });
    onCloseRef.current();
  }, []);

  const beginRecording = useCallback(
    async (activeStream: MediaStream, targetSlot: number, sessionId: number) => {
      if (sessionRef.current !== sessionId || startedSessionRef.current === sessionId) return;
      startedSessionRef.current = sessionId;
      haptic("warning");
      setRecordingState("recording");

      try {
        const { blob } = await recordStreamForMs(activeStream, 3000, "video");
        if (sessionRef.current !== sessionId) return;
        setRecordingState("saving");
        await onCaptureRef.current(targetSlot, blob);
        haptic("success");
      } catch (err) {
        if (sessionRef.current !== sessionId) return;
        console.error("[camera] recordStreamForMs failed:", err);
        toast.error("Video sa nepodarilo nahrať alebo uložiť. Skús to znova.");
      } finally {
        stopStream(activeStream);
        if (sessionRef.current === sessionId) {
          setStream(null);
          onCloseRef.current();
        }
      }
    },
    [haptic],
  );

  // Acquire camera when modal opens or facingMode switches.
  useEffect(() => {
    if (slotIndex === null) return;
    const session = ++sessionRef.current;
    startedSessionRef.current = null;
    setRecordingState("countdown");
    setCountdown(3);

    let localStream: MediaStream | null = null;
    void openCamera({
      video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    })
      .then((acquired) => {
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
  }, [slotIndex, facingMode]);

  useEffect(() => {
    if (slotIndex === null || !stream || !videoRef.current) return;
    void attachStreamToVideo(videoRef.current, stream);
  }, [slotIndex, stream]);

  useEffect(() => {
    if (slotIndex === null || recordingState !== "countdown" || !stream) return;
    if (countdown > 0) {
      const timer = window.setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
      return () => window.clearTimeout(timer);
    }
    void beginRecording(stream, slotIndex, sessionRef.current);
  }, [slotIndex, recordingState, countdown, stream, beginRecording]);

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

  if (slotIndex === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-state="open"
      className="fixed inset-0 z-[150] flex flex-col justify-between bg-black text-white select-none"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 size-full object-cover ${
          facingMode === "user" ? "-scale-x-100" : ""
        }`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />

      {/* Top safe-area toolbar */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          data-camera-cancel="true"
          onClick={() => {
            haptic("tap");
            cancel();
          }}
          aria-label="Zrušiť nahrávanie"
          className="grid size-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md active:scale-95"
        >
          <X className="size-6" aria-hidden="true" />
        </button>

        {recordingState === "recording" ? (
          <div className="flex items-center gap-2 rounded-full bg-destructive px-3.5 py-1.5 text-sm font-bold text-white shadow-lg">
            <span className="size-2 animate-pulse rounded-full bg-white" />
            <span>Nahráva sa · 3 s</span>
          </div>
        ) : (
          <span className="rounded-full bg-black/45 px-3.5 py-1.5 font-display text-sm font-semibold text-white/90 backdrop-blur-md">
            {title}
          </span>
        )}

        <button
          type="button"
          disabled={recordingState !== "countdown"}
          onClick={() => {
            haptic("tap");
            setFacingMode((m) => (m === "user" ? "environment" : "user"));
          }}
          aria-label={
            facingMode === "user" ? "Prepnúť na zadnú kameru" : "Prepnúť na prednú kameru"
          }
          className="grid size-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md active:scale-95 disabled:opacity-35"
        >
          <SwitchCamera className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* Center guide */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center pointer-events-none">
        {recordingState === "countdown" && (
          <div className="flex flex-col items-center">
            <span className="font-display text-7xl font-bold text-white tabular-nums drop-shadow">
              {countdown}
            </span>
            <span className="mt-2 rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-white/90 backdrop-blur-sm">
              {stream ? "Priprav sa…" : "Spúšťam kameru…"}
            </span>
          </div>
        )}
        {recordingState === "saving" && (
          <div className="rounded-2xl bg-black/70 px-5 py-3 text-base font-semibold text-white backdrop-blur-md">
            Ukladám video…
          </div>
        )}
      </div>

      {/* Bottom safe-area action dock */}
      <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {recordingState === "countdown" && stream && (
          <button
            type="button"
            onClick={() => {
              haptic("medium");
              void beginRecording(stream, slotIndex, sessionRef.current);
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-coral px-6 py-3 font-display text-base font-bold text-white shadow-lg active:scale-95 cursor-pointer"
          >
            <Video className="size-5" aria-hidden="true" />
            <span>Spustiť hneď</span>
          </button>
        )}
        {recordingState === "recording" && (
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/30" aria-hidden="true">
            <div className="h-full w-full origin-left bg-coral animate-[camera-progress_3s_linear_forwards]" />
          </div>
        )}
        <p className="text-xs text-white/75">Krátky 3-sekundový moment bez zvuku</p>
      </div>
    </div>,
    document.body,
  );
}
