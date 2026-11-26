import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, ChevronDown } from "lucide-react";
import { SnippetRows } from "@/components/SnippetRows";
import { UserProfile } from "@/lib/resonance";
import { useHaptic } from "@/hooks/use-haptics";
import { openCamera, recordStreamForMs, stopStream, attachStreamToVideo } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { updateSharedReflection } from "@/lib/conversations";
import { ReflectionEditor } from "./ReflectionEditor";
import { ProfileVisibilityPreview } from "./ProfileVisibilityPreview";

interface AssetDossierProps {
  user: UserProfile;
  onUpdateUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  onBack: () => void;
}

export function AssetDossier({ user, onUpdateUser, onBack }: AssetDossierProps) {
  const haptic = useHaptic();
  const profileHeader = useRef<HTMLElement>(null);

  useEffect(() => {
    profileHeader.current?.closest(".app-main-viewport")?.scrollTo({ top: 0 });
    profileHeader.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, []);

  // Snippets local list — initialized from profile data
  const [snippets, setSnippets] = useState<string[]>(user.videoUrls ?? []);
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
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const currentStream = cameraStream;
    return () => {
      if (currentStream) stopStream(currentStream);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cameraStream]);

  // Handle app going to background / tab switch
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

  // Local settings states
  const [distance, setDistance] = useState(
    user.radiusKm && user.radiusKm < 500 ? user.radiusKm : 200,
  );
  const [isGlobalMode, setIsGlobalMode] = useState(
    user.radiusKm === undefined || user.radiusKm >= 500,
  );
  const [orientation, setOrientation] = useState(user.orientation || "hetero");

  function getTargetMarket(gender: string, orient: string): "male" | "female" | "all" {
    if (orient === "bi") return "all";
    if (orient === "homo") {
      return gender === "female" ? "female" : "male";
    }
    // hetero
    return gender === "female" ? "male" : "female";
  }

  async function handleTargetMarketChange(newTarget: "male" | "female" | "all") {
    let calculatedOrientation: "hetero" | "homo" | "bi" = "bi";
    if (newTarget === "all" || user.gender === "other") {
      calculatedOrientation = "bi";
    } else if (user.gender === newTarget) {
      calculatedOrientation = "homo";
    } else {
      calculatedOrientation = "hetero";
    }
    setOrientation(calculatedOrientation);
    saveFilterChange("orientation", calculatedOrientation);
  }

  async function saveFilterChange(key: string, value: any) {
    onUpdateUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [key]: value,
      };
    });

    const userId = user.id;
    const dbKey = key === "radiusKm" ? "radius_km" : key;
    if (userId && userId !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ [dbKey]: value })
        .eq("id", userId);
      if (error) {
        console.error(`[AssetDossier] Failed to update ${key} in DB:`, error);
      }
    }
  }
  // Push snippet changes to parent profile (non-circular, explicit)
  function syncVideoUrls(urls: string[]) {
    onUpdateUser((prev) => {
      if (!prev) return null;
      return { ...prev, videoUrls: urls };
    });
  }

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
      console.error("[dossier] openCamera failed:", err);
      alert("Kamera sa nespustila. Skontroluj, či má Antidote prístup ku kamere.");
      cancelRecording();
      return;
    }

    setTimeout(() => {
      if (videoRef.current) {
        attachStreamToVideo(videoRef.current, stream);
      }
    }, 100);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          intervalRef.current = null;
          triggerRecord(stream, index);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    intervalRef.current = interval;
  }

  async function uploadFileAndSave(index: number, blob: Blob | File) {
    const userId = user.id || "00000000-0000-0000-0000-000000000001";
    if (userId === "00000000-0000-0000-0000-000000000001") {
      // Demo Mode
      const videoUrl = URL.createObjectURL(blob);
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        syncVideoUrls(next);
        return next;
      });
      return;
    }

    // Upload to Storage
    const filename = `${userId}/slot_${index + 1}_${Date.now()}.mp4`;
    const { data, error } = await supabase.storage.from("media-snippets").upload(filename, blob, {
      contentType: blob.type || "video/mp4",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      console.error("[dossier] upload error:", error);
      alert(`Ukladanie zlyhalo: ${error.message}`);
      throw error;
    }

    // Retrieve signed URL (bucket is private)
    const { data: signedData, error: signError } = await supabase.storage
      .from("media-snippets")
      .createSignedUrl(filename, 60 * 60 * 24 * 7);

    if (signError || !signedData?.signedUrl) {
      console.error("[dossier] signed url error:", signError);
      alert("Video je uložené, ale náhľad sa nepodarilo načítať.");
      throw signError || new Error("Signed URL failed");
    }

    const videoUrl = signedData.signedUrl;

    // Save to Database Table
    const { error: dbError } = await supabase.from("media_snippets").upsert(
      {
        user_id: userId,
        slot_index: index + 1,
        video_url: videoUrl,
      },
      { onConflict: "user_id, slot_index" }
    );

    if (dbError) {
      console.error("[dossier] database save error:", dbError);
      alert(`Video sa nepodarilo pridať do profilu.`);
      throw dbError;
    }

    setSnippets((prev) => {
      const next = [...prev];
      next[index] = videoUrl;
      syncVideoUrls(next);
      return next;
    });
  }

  async function triggerRecord(stream: MediaStream, index: number) {
    haptic("warning");
    setRecordingState("recording");

    try {
      const { blob } = await recordStreamForMs(stream, 3000, "video");
      setRecordingState("saving");

      // Enforce max upload limit of 5 MB
      const maxLimit = 5 * 1024 * 1024;
      if (blob.size > maxLimit) {
        alert(`Súbor je príliš veľký (${(blob.size / 1024 / 1024).toFixed(2)} MB). Limit je 5 MB.`);
        throw new Error("File size exceeds 5MB limit");
      }

      await uploadFileAndSave(index, blob);
      haptic("success");
    } catch (err) {
      console.error("[dossier] recordStreamForMs failed:", err);
      alert("Video sa nepodarilo nahrať alebo uložiť.");
    } finally {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopStream(stream);
      setCameraStream(null);
      setRecordingIndex(null);
      setRecordingState("idle");
    }
  }

  function cancelRecording() {
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

  // Gallery File Upload Trim logic
  function triggerFileUpload(index: number) {
    haptic("tap");
    setActiveUploadIndex(index);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function compressVideo(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.src = objectUrl;
      video.muted = true;
      video.playsInline = true;
      video.style.position = "absolute";
      video.style.left = "-9999px";
      video.style.top = "-9999px";
      document.body.appendChild(video);

      const cleanup = () => {
        if (video.parentNode) {
          document.body.removeChild(video);
        }
        URL.revokeObjectURL(objectUrl);
      };

      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 640; // 3:4 portrait aspect ratio
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Could not get canvas context"));
        return;
      }

      video.onloadedmetadata = () => {
        video.play().then(() => {
          const fps = 30;
          const stream = canvas.captureStream(fps);
          
          let options: MediaRecorderOptions = { mimeType: "video/webm;codecs=vp8" };
          if (typeof MediaRecorder.isTypeSupported === "function") {
            if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: "video/mp4" };
            }
            if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: "" };
            }
          } else {
            options = { mimeType: "" };
          }

          const mediaRecorder = new MediaRecorder(stream, options);
          const chunks: Blob[] = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              chunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            const finalBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "video/mp4" });
            cleanup();
            resolve(finalBlob);
          };

          let animationFrameId: number;
          function drawFrame() {
            if (!ctx) return;
            if (video.paused || video.ended) {
              cancelAnimationFrame(animationFrameId);
              if (mediaRecorder.state === "recording") {
                mediaRecorder.stop();
              }
              return;
            }

            const vWidth = video.videoWidth;
            const vHeight = video.videoHeight;
            const targetWidth = canvas.width;
            const targetHeight = canvas.height;
            const vRatio = vWidth / vHeight;
            const targetRatio = targetWidth / targetHeight;

            let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;

            if (vRatio > targetRatio) {
              sWidth = vHeight * targetRatio;
              sx = (vWidth - sWidth) / 2;
            } else {
              sHeight = vWidth / targetRatio;
              sy = (vHeight - sHeight) / 2;
            }

            ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
            animationFrameId = requestAnimationFrame(drawFrame);
          }

          mediaRecorder.start();
          drawFrame();

          const maxDuration = Math.min(3000, video.duration * 1000);
          setTimeout(() => {
            if (mediaRecorder.state === "recording") {
              video.pause();
            }
          }, maxDuration);
        }).catch(err => {
          cleanup();
          reject(err);
        });
      };

      video.onerror = (err) => {
        cleanup();
        reject(err);
      };
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const index = activeUploadIndex;
    if (index === null) return;

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Vyber súbor s videom.");
      setActiveUploadIndex(null);
      return;
    }

    // Enforce max upload limit of 30 MB (fallback raw limit)
    const maxLimit = 30 * 1024 * 1024;
    if (file.size > maxLimit) {
      alert(`Súbor je príliš veľký (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximálny limit je 30 MB.`);
      setActiveUploadIndex(null);
      return;
    }

    setIsUploading(true);

    try {
      let uploadBlob: Blob | File = file;

      // Auto compress to 480p portrait 3s loops using canvas recording if supported
      if (typeof HTMLCanvasElement.prototype.captureStream === "function" && typeof window.MediaRecorder === "function") {
        try {
          uploadBlob = await compressVideo(file);
        } catch (compressErr) {
          console.warn("[dossier] Client-side video compression failed, using original file:", compressErr);
        }
      }

      haptic("warning");
      await uploadFileAndSave(index, uploadBlob);
      haptic("success");
    } catch (err: any) {
      console.error("[dossier] handleFileChange upload failed:", err);
      alert(`Nahrávanie zlyhalo: ${err.message || err}`);
    } finally {
      setIsUploading(false);
      setActiveUploadIndex(null);
    }
  }

  async function deleteSnippet(index: number) {
    if (!confirm("Naozaj chcete odstrániť toto video?")) return;
    haptic("warning");

    const userId = user.id || "00000000-0000-0000-0000-000000000001";
    if (userId !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("media_snippets")
        .delete()
        .eq("user_id", userId)
        .eq("slot_index", index + 1);

      if (error) {
        console.error("[dossier] failed to delete snippet from database:", error);
        alert("Video sa nepodarilo odstrániť z profilu.");
        return;
      }
    }

    setSnippets((prev) => {
      const next = [...prev];
      next[index] = ""; // Keep slot empty instead of splicing/shifting to avoid slot-index misalignment in database!
      syncVideoUrls(next);
      return next;
    });
  }

  // Algorithmic Age Bracket Calculations (Half-your-age-plus-seven reciprocity)
  const minBracketAge = Math.max(18, Math.floor(user.age / 2 + 7));
  const maxBracketAge = Math.floor((user.age - 7) * 2);
  const calculatedBracket = `[${minBracketAge} - ${maxBracketAge < minBracketAge ? minBracketAge : maxBracketAge}]`;

  // Slovak attachment styles mapper
  const styleMap: Record<string, string> = {
    Secure: "BEZPEČNÝ",
    Anxious: "ÚZKOSTNÝ",
    Avoidant: "VYHÝBAVÝ",
    Fearful: "DEZORGANIZOVANÝ",
  };
  const attachmentStyleSlovak = styleMap[user.attachmentStyle || "Secure"] || "BEZPEČNÝ";

  const primaryMarker = `[${attachmentStyleSlovak}]`;
  const decisionLatency = `${(user.avgResponseTime || 2.45).toFixed(2)}s`;
  const redemptionQuota = `${user.redemptionQuota ?? 0}`;
  const cognitiveDepth = `${(user.cognitiveDepth || 0.55).toFixed(2)}`;
  const conscientiousness = `${(user.conscientiousness || 0.5).toFixed(2)}`;
  const extraversion = `${(user.extraversion || 0.5).toFixed(2)}`;
  const hesitationFlag = user.hesitated ? "[ÁNO]" : "[NIE]";

  return (
    <>
      <div className="personal-screen">
        <header ref={profileHeader} className="personal-header">
          <button type="button" onClick={onBack} className="personal-action mb-3 inline-flex items-center gap-2">
            <ArrowLeft className="size-4" aria-hidden="true" />Späť do Spojení
          </button>
          <h1 tabIndex={-1} className="personal-title">{user.name}</h1>
          <p className="personal-intro">{[user.age && `${user.age} rokov`, user.city].filter(Boolean).join(" · ")}</p>
        </header>

        {user.id && <ReflectionEditor key={user.id} initialValue={user.sharedReflection} onSave={async value => {
          await updateSharedReflection(user.id!, value);
          onUpdateUser(previous => previous && previous.id === user.id ? { ...previous, sharedReflection: value } : previous);
        }} />}

        <ProfileVisibilityPreview key={user.id} user={user} />

        <section className="personal-section profile-moments" aria-labelledby="moments-title">
          <h2 id="moments-title" className="personal-heading">Tvoje momenty</h2>
          <p className="personal-status mb-3">Vo vašom rozhovore sa videá sprístupnia až po súhlase vás oboch.</p>
          <div className="moment-progress" aria-label={`Pridané videá: ${snippets.filter(Boolean).length} zo 4`}>
            <span className="moment-progress-label">{snippets.filter(Boolean).length} / 4 videá</span>
            <span className="moment-progress-track" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index} data-filled={!!snippets[index]} />)}</span>
          </div>
          <SnippetRows snippets={snippets} onRecord={startRecording} onUpload={triggerFileUpload} onRemove={deleteSnippet} />
          <input type="file" ref={fileInputRef} accept="video/*" className="hidden" onChange={handleFileChange} />
        </section>

        {/* Market Parameters (Moved from settings to DNA section) */}
        <details className="personal-section profile-filters" open>
          <summary className="personal-summary"><span><span className="personal-heading">Koho chceš spoznať?</span><span className="summary-detail">{isGlobalMode ? "Celý svet" : `Do ${distance} km`}</span></span><ChevronDown className="size-5" aria-hidden="true" /></summary>

          <div className="space-y-3 pt-3">
            {/* Global vs National Toggle */}
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-foreground/10 pb-3">
              <span className="font-medium">Rozsah vyhľadávania</span>
              <div className="personal-segments w-full sm:w-52" role="group" aria-label="Rozsah vyhľadávania">
                <button
                  onClick={() => {
                    haptic("tap");
                    setIsGlobalMode(false);
                    saveFilterChange("radiusKm", distance);
                  }}
                  aria-pressed={!isGlobalMode}
                  className="personal-segment"
                >
                  V okolí
                </button>
                <button
                  onClick={() => {
                    haptic("tap");
                    setIsGlobalMode(true);
                    saveFilterChange("radiusKm", 500); // 500+ triggers Global search
                  }}
                  aria-pressed={isGlobalMode}
                  className="personal-segment"
                >
                  Celý svet
                </button>
              </div>
            </div>

            {/* Distance Filter */}
            <div
              className={
                isGlobalMode
                  ? "opacity-30 pointer-events-none transition-opacity"
                  : "transition-opacity"
              }
            >
              <div className="flex justify-between mb-1">
                <span className="text-foreground/75 text-sm font-medium">Maximálna vzdialenosť</span>
                <span className="font-bold text-cerebral">{distance} km</span>
              </div>
              <input
                type="range"
                min="5"
                max="250"
                step="5"
                value={distance}
                disabled={isGlobalMode}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDistance(val);
                  saveFilterChange("radiusKm", val);
                }}
                aria-label="Maximálna vzdialenosť"
                aria-describedby={isGlobalMode ? undefined : "nearby-radius-info"}
                className="my-3 h-2 w-full cursor-pointer accent-cerebral"
              />
              {!isGlobalMode && (
                <p id="nearby-radius-info" className="personal-status">
                  V Spojeniach uvidíš iba ľudí v nastavenej vzdialenosti.
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-2 font-medium">Koho hľadáš</legend>
              <div className="personal-segments profile-target-choices">
                {([
                  ["male", "Mužov"],
                  ["female", "Ženy"],
                  ["all", "Všetkých"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="personal-segment"
                    aria-pressed={getTargetMarket(user.gender, orientation) === value}
                    onClick={() => {
                      if (getTargetMarket(user.gender, orientation) === value) return;
                      haptic("tap");
                      void handleTargetMarketChange(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </details>

        <details className="personal-section group">
          <summary className="personal-summary">
            <h2 className="personal-heading">Tvoja osobnosť</h2>
            <ChevronDown className="size-5 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 pt-3">
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Typ osobnosti</span>
              <span className="font-bold text-cerebral">{primaryMarker}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Rýchlosť odpovedí</span>
              <span className="font-bold text-foreground">{decisionLatency}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Zostávajúce pokusy</span>
              <span className="font-bold text-foreground">{redemptionQuota}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Hĺbka osobnosti</span>
              <span className="font-bold text-cerebral">{cognitiveDepth}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Svedomitosť</span>
              <span className="font-bold text-foreground">{conscientiousness}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Extraverzia</span>
              <span className="font-bold text-foreground">{extraversion}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/5 pb-2">
              <span className="text-foreground/70">Váhavosť pri teste</span>
              <span className="font-bold text-foreground">{hesitationFlag}</span>
            </div>

            {/* HARDCODED ALGORITHMIC BRACKET */}
            <div className="flex justify-between border-b border-foreground/5 pb-2 border-dashed">
              <span className="text-cerebral font-bold">Hľadaný vek partnera</span>
              <span className="font-black text-cerebral font-sans">{calculatedBracket}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-foreground/70">Stav účtu</span>
              <span className="font-bold text-cerebral uppercase flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-cerebral animate-pulse" />
                Profil je pripravený
              </span>
            </div>
          </div>
        </details>
      </div>

      {/* Recording Overlay Modal */}
      {recordingIndex !== null && createPortal(
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-[150] flex flex-col justify-center items-center p-4">
          <div className="editorial-dock w-full max-w-xs p-4 relative">
            <div className="mb-3 font-display text-lg font-bold">
              Nahrať moment
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
                  <span className="font-sans text-4xl text-white font-bold animate-ping">
                    {countdown}
                  </span>
                  <span className="font-sans text-xs text-white/50 tracking-wide uppercase mt-2">
                    Príprava...
                  </span>
                </div>
              )}

              {recordingState === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 border border-red-500">
                  <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
                  <span className="font-sans text-xs text-white tracking-wide uppercase">
                    Nahráva sa (3 s)
                  </span>
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

      {isUploading && createPortal(
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-[200] flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-xs border border-foreground/20 bg-card p-6 rounded-none text-center space-y-4 animate-fade-up">
            <Loader2 className="size-8 animate-spin text-foreground mx-auto animate-pulse" />
            <h3 className="font-sans text-sm font-bold uppercase text-foreground">
              Spracovanie videa...
            </h3>
            <p className="text-xs text-foreground/60 font-sans max-w-xs leading-relaxed uppercase">
              Komprimujem a nahrávam súbor <br />
              (môže to trvať niekoľko sekúnd)
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
