import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { PROFILE_SLOTS, SnippetRows } from "@/components/SnippetRows";
import { VideoRecorderModal } from "@/components/VideoRecorderModal";
import { useHaptic } from "@/hooks/use-haptics";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);

  function startRecording(index: number) {
    haptic("tap");
    setRecordingIndex(index);
  }

  function handleCapturedSnippet(index: number, blob: Blob) {
    const videoUrl = URL.createObjectURL(blob);
    setSnippets((prev) => {
      const next = [...prev];
      next[index] = videoUrl;
      syncSnippetsToDB(next).catch(console.error);
      return next;
    });
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

      <VideoRecorderModal
        slotIndex={recordingIndex}
        title="Nahrávanie videa"
        onCapture={handleCapturedSnippet}
        onClose={() => setRecordingIndex(null)}
      />
    </div>
  );
}
