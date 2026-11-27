import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PROFILE_SLOTS, SnippetRows } from "@/components/SnippetRows";
import { useHaptic } from "@/hooks/use-haptics";
import { openCamera, recordStreamForMs, stopStream, attachStreamToVideo } from "@/lib/media";
import { saveVideoBlob, getVideoBlob, clearVideoBlobs } from "@/lib/indexeddb";

async function syncSnippetsToDB(urls: string[]) {
  try {
    await clearVideoBlobs();
    const active = urls.filter(Boolean);
    for (let i = 0; i < active.length; i++) {
      const res = await fetch(active[i]);
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

  // Initialize snippets list as empty slots
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
      const filtered = loaded.filter(Boolean);
      if (filtered.length > 0) {
        setSnippets(filtered);
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);

  useEffect(() => {
    const currentStream = cameraStream;
    return () => {
      if (currentStream) stopStream(currentStream);
    };
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Handle app going to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
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
    setRecordingIndex(index);
    setRecordingState("countdown");
    setCountdown(3);

    let stream: MediaStream;
    try {
      stream = await openCamera({
        video: { facingMode: "user" },
        audio: false,
      });
      setCameraStream(stream);
    } catch (err) {
      console.error("[onboarding-snippets] openCamera failed:", err);
      alert("Kamera sa nespustila. Skontroluj, či má Antidote prístup ku kamere.");
      cancelRecording();
      return;
    }

    setTimeout(() => {
      if (videoRef.current) {
        attachStreamToVideo(videoRef.current, stream);
      }
    }, 100);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          triggerRecord(stream, index);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function triggerRecord(stream: MediaStream, index: number) {
    haptic("warning");
    setRecordingState("recording");

    try {
      const { blob } = await recordStreamForMs(stream, 3000, "video");
      setRecordingState("saving");

      const videoUrl = URL.createObjectURL(blob);
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        const filtered = next.filter(Boolean);
        syncSnippetsToDB(filtered).catch(console.error);
        return filtered;
      });

      haptic("success");
    } catch (err) {
      console.error("[onboarding-snippets] recordStreamForMs failed:", err);
      alert("Nahrávanie zlyhalo.");
    } finally {
      stopStream(stream);
      setCameraStream(null);
      setRecordingIndex(null);
      setRecordingState("idle");
    }
  }

  function cancelRecording() {
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
      alert("Vyber súbor s videom, napríklad MP4, MOV alebo WebM.");
      setActiveUploadIndex(null);
      return;
    }

    const videoUrl = URL.createObjectURL(file);

    const applyVideo = () => {
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        const filtered = next.filter(Boolean);
        syncSnippetsToDB(filtered).catch(console.error);
        return filtered;
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
        alert(
          "Video je dlhšie ako 3 sekundy. Bude automaticky orezané a zacyklené na prvých 3 sekundách.",
        );
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
      if (index === 0) {
        next[0] = "";
      } else {
        next[index] = "";
      }
      const filtered = next.filter(Boolean);
      syncSnippetsToDB(filtered).catch(console.error);
      return filtered;
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
          Na profil potrebuješ jedno trojsekundové video. Ďalšie tri sú voliteľné.
        </p>
      </header>
      <section className="onboarding-panel first-profile-video" aria-labelledby="first-profile-video">
        <h2 id="first-profile-video" className="personal-heading">{videoCount ? "Prvé video" : "Pridaj prvé video"}</h2>
        {videoCount ? (
          <SnippetRows snippets={snippets} onRecord={startRecording} onUpload={triggerFileUpload} onRemove={deleteSnippet} slotIndices={[firstSlot]} />
        ) : (
          <div className="mt-3 grid gap-2">
            <button type="button" className="tactile-button min-h-12 bg-accent px-3 font-semibold text-accent-foreground" onClick={() => startRecording(0)}>
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
            Ďalšie videá <span className="font-normal text-muted-foreground">· voliteľné</span>
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
              alert("Na vytvorenie účtu pridaj aspoň jedno video z kamery alebo galérie.");
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
          className={`w-full rounded-[0.625rem] border border-foreground py-3.5 text-base font-bold transition-colors ${
            videoCount === 0 || isSubmitting
              ? "opacity-40 cursor-not-allowed bg-foreground/20 text-muted-foreground border-foreground/20"
              : "text-background bg-foreground hover:bg-foreground/90 cursor-pointer"
          }`}
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
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-[150] flex flex-col justify-center items-center p-4">
          <div className="editorial-dock w-full max-w-xs p-4 relative">
            <div className="mb-3 font-display text-lg font-bold">
              Nahrávanie videa
            </div>

            <div className="relative mx-auto mb-3 aspect-[3/4] w-[min(100%,12rem,40dvh)] overflow-hidden bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full object-contain bg-black"
                style={{ transform: "scaleX(-1)" }}
              />

              {recordingState === "countdown" && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <span className="text-4xl text-white font-bold animate-ping">{countdown}</span>
                  <span className="text-xs text-white/50 tracking-widest uppercase mt-2">
                    Príprava...
                  </span>
                </div>
              )}

              {recordingState === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 border border-red-500">
                  <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs text-white tracking-widest uppercase">Nahráva sa (3 s)</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={cancelRecording}
                className="personal-action flex-1"
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
