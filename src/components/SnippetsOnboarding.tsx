import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { PROFILE_SLOTS, SnippetRows } from "@/components/SnippetRows";
import { useHaptic } from "@/hooks/use-haptics";
import { openCamera, recordStreamForMs, stopStream, attachStreamToVideo } from "@/lib/media";
import { saveVideoBlob, getVideoBlob, clearVideoBlobs } from "@/lib/indexeddb";

async function syncSnippetsToDB(urls: string[]) {
  try {
    await clearVideoBlobs();
    for (let i = 0; i < 4; i++) {
      const url = urls[i];
      if (!url) continue;
      const res = await fetch(url);
      const blob = await res.blob();
      await saveVideoBlob(`snippet_${i + 1}`, blob);
    }
  } catch (err) {
    console.error("[syncSnippetsToDB] Failed to sync blobs:", err);
  }
}

interface SnippetsOnboardingProps {
  initialSnippets?: string[];
  onDone: (urls: string[]) => void | Promise<void>;
}

export function SnippetsOnboarding({ initialSnippets = [], onDone }: SnippetsOnboardingProps) {
  const haptic = useHaptic();

  // Initialize snippets list preserving slot indices 0..3
  const [snippets, setSnippets] = useState<string[]>(initialSnippets || []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadSnippets() {
      const loaded: string[] = initialSnippets && initialSnippets.length > 0 ? [...initialSnippets] : [];
      for (let idx = 0; idx < 4; idx++) {
        if (!loaded[idx]) {
          const blob = await getVideoBlob(`snippet_${idx + 1}`);
          if (blob) {
            loaded[idx] = URL.createObjectURL(blob);
          }
        }
      }
      if (loaded.some(Boolean)) {
        setSnippets(loaded);
      }
    }
    loadSnippets().catch((err) => console.error("Failed to load snippets on mount:", err));
  }, [initialSnippets]);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [recordingState, setRecordingState] = useState<
    "idle" | "countdown" | "recording" | "saving"
  >("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(0);
  const triggeredSessionRef = useRef<number | null>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);

  useEffect(() => {
    const currentStream = cameraStream;
    return () => {
      if (currentStream) stopStream(currentStream);
    };
  }, [cameraStream]);

  useEffect(() => {
    if (recordingIndex === null || !cameraStream || !videoRef.current) return;
    void attachStreamToVideo(videoRef.current, cameraStream);
  }, [cameraStream, recordingIndex]);

  useEffect(() => {
    if (recordingState !== "countdown" || recordingIndex === null || !cameraStream) return;
    if (countdown > 0) {
      const timer = window.setTimeout(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => window.clearTimeout(timer);
    }
    const session = sessionRef.current;
    if (triggeredSessionRef.current === session) return;
    triggeredSessionRef.current = session;
    void triggerRecord(cameraStream, recordingIndex, session);
  }, [recordingState, countdown, cameraStream, recordingIndex]);

  // Handle app going to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sessionRef.current += 1;
        if (cameraStream) {
          stopStream(cameraStream);
          setCameraStream(null);
        }
        setRecordingIndex(null);
        setRecordingState("idle");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cameraStream]);

  // JIT Camera Record Flow
  async function startRecording(index: number) {
    haptic("tap");
    const session = ++sessionRef.current;
    triggeredSessionRef.current = null;
    if (cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
    }
    setRecordingIndex(index);
    setRecordingState("countdown");
    setCountdown(3);

    let stream: MediaStream;
    try {
      stream = await openCamera();
      if (sessionRef.current !== session) {
        stopStream(stream);
        return;
      }
      setCameraStream(stream);
    } catch (err) {
      console.error("[onboarding-snippets] openCamera failed:", err);
      toast.error("Kamera sa nespustila. Skontroluj, či má Antidote prístup ku kamere.");
      cancelRecording();
      return;
    }
  }

  async function triggerRecord(stream: MediaStream, index: number, session: number) {
    if (sessionRef.current !== session) return;
    haptic("warning");
    setRecordingState("recording");

    try {
      const { blob } = await recordStreamForMs(stream, 3000, "video");
      if (sessionRef.current !== session) return;
      setRecordingState("saving");

      const videoUrl = URL.createObjectURL(blob);
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        syncSnippetsToDB(next).catch(console.error);
        return next;
      });

      haptic("success");
    } catch (err) {
      if (sessionRef.current !== session) return;
      console.error("[onboarding-snippets] recordStreamForMs failed:", err);
      toast.error("Nahrávanie zlyhalo. Skús to znova.");
    } finally {
      stopStream(stream);
      if (sessionRef.current === session) {
        setCameraStream(null);
        setRecordingIndex(null);
        setRecordingState("idle");
      }
    }
  }

  function cancelRecording() {
    sessionRef.current += 1;
    triggeredSessionRef.current = null;
    if (cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
    }
    setRecordingIndex(null);
    setRecordingState("idle");
  }

  // Gallery File Upload Trim logic
  function triggerFileUpload(index: number) {
    haptic("tap");
    setActiveUploadIndex(index);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const index = activeUploadIndex;
    if (index === null) return;

    const file = e.target.files?.[0];
    if (!file) {
      setActiveUploadIndex(null);
      return;
    }

    const isVideo =
      file.type.startsWith("video/") ||
      /\.(mp4|mov|webm|mkv|3gp|m4v|avi)$/i.test(file.name);

    if (!isVideo) {
      toast.error("Vyber súbor s videom, napríklad MP4, MOV alebo WebM.");
      setActiveUploadIndex(null);
      return;
    }

    const videoUrl = URL.createObjectURL(file);

    const applyVideo = () => {
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        syncSnippetsToDB(next).catch(console.error);
        return next;
      });
      haptic("success");
      setActiveUploadIndex(null);
    };

    let resolved = false;
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        applyVideo();
      }
    }, 1200);

    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = videoUrl;
    tempVideo.onloadedmetadata = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(fallbackTimer);
      if (tempVideo.duration > 3.5) {
        toast.info("Video je dlhšie ako 3 sekundy — automaticky použijeme prvé 3 sekundy.");
      }
      applyVideo();
    };
    tempVideo.onerror = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(fallbackTimer);
      applyVideo();
    };
  }

  function deleteSnippet(index: number) {
    haptic("warning");
    setSnippets((prev) => {
      const next = [...prev];
      next[index] = "";
      syncSnippetsToDB(next).catch(console.error);
      return next;
    });
  }

  const videoCount = snippets.filter(Boolean).length;
  const firstSlot = Math.max(0, snippets.findIndex(Boolean));
  const optionalSlots = PROFILE_SLOTS.filter((slot) => slot !== firstSlot);

  return (
    <div className="personal-screen">
      <header className="personal-header">
        <p className="personal-eyebrow">Tvoj profil</p>
        <h1 className="personal-title">Pridaj krátke video</h1>
        <p className="personal-intro">
          Jedno trojsekundové video na profil. Ďalšie tri sú voliteľné.
        </p>
      </header>
      <section className="onboarding-panel first-profile-video" aria-labelledby="first-profile-video">
        <h2 id="first-profile-video" className="personal-heading">{videoCount ? "Prvé video" : "Prvé video do profilu"}</h2>
        {videoCount ? (
          <SnippetRows snippets={snippets} onRecord={startRecording} onUpload={triggerFileUpload} onRemove={deleteSnippet} slotIndices={[firstSlot]} />
        ) : (
          <div className="mt-3 grid gap-2.5">
            <button type="button" className="tactile-button min-h-12 bg-coral px-4 font-semibold text-coral-foreground" onClick={() => startRecording(0)}>
              Nahrať kamerou
            </button>
            <button type="button" className="personal-action min-h-12 font-semibold" onClick={() => triggerFileUpload(0)}>
              Vybrať z galérie
            </button>
          </div>
        )}
      </section>
      <details className="onboarding-panel optional-profile-videos">
        <DisclosureSummary className="font-semibold">
          <span>
            Ďalšie videá <span className="font-normal text-muted-foreground">(voliteľné)</span>
          </span>
        </DisclosureSummary>
        <SnippetRows snippets={snippets} onRecord={startRecording} onUpload={triggerFileUpload} onRemove={deleteSnippet} slotIndices={optionalSlots} />
      </details>

      <input
        type="file"
        ref={fileInputRef}
        accept="video/*,video/mp4,video/quicktime,video/webm,video/3gpp,video/x-matroska"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Action Footer */}
      <div className="mt-4 space-y-3">
        <button
          type="button"
          disabled={videoCount === 0 || isSubmitting}
          onClick={async () => {
            const activeSnippets = snippets.filter(Boolean);
            if (activeSnippets.length === 0) {
              haptic("error");
              toast.error("Na vytvorenie účtu pridaj aspoň jedno video z kamery alebo galérie.");
              return;
            }
            setIsSubmitting(true);
            haptic("success");
            try {
              await onDone(activeSnippets);
            } catch (err) {
              console.error("[SnippetsOnboarding] onDone error:", err);
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="priority-primary"
        >
          {isSubmitting
            ? "Ukladám video…"
            : "Pokračovať"}
        </button>
        <p className="text-sm text-muted-foreground text-center">
          Videá sa prehrávajú bez zvuku.
        </p>
      </div>

      {/* Recording Overlay Modal */}
      {recordingIndex !== null && createPortal(
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="editorial-dock relative w-full max-w-xs p-4">
            <div className="mb-3 font-display text-lg font-bold">
              Nahrávanie videa
            </div>

            <div className="relative mx-auto mb-3 aspect-[3/4] w-[min(100%,12rem,40dvh)] overflow-hidden rounded-xl border border-foreground/15 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full object-contain bg-black"
                style={{ transform: "scaleX(-1)" }}
              />

              {recordingState === "countdown" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55">
                  <span className="font-display text-5xl font-bold text-white tabular-nums">{countdown}</span>
                  <span className="mt-1.5 text-xs font-medium text-white/75">
                    Priprav sa…
                  </span>
                </div>
              )}

              {recordingState === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" />
                  <span className="text-xs font-semibold text-white">Nahráva sa · 3 s</span>
                </div>
              )}

              {recordingState === "saving" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65">
                  <span className="text-sm font-semibold text-white">Ukladám video…</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="personal-action flex-1 rounded-xl"
              >
                Zrušiť
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
