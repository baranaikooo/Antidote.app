import { Slider } from "@/components/ui/slider";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  pendingRadius: number | null;
  onChangeRadius: (radius: number) => Promise<void>;
}

export function AssetDossier({ user, onUpdateUser, onBack, pendingRadius, onChangeRadius }: AssetDossierProps) {
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
  const sessionRef = useRef(0);
  const triggeredSessionRef = useRef<number | null>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

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

  // Handle app going to background / tab switch
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

  // Local settings states
  const [distance, setDistance] = useState(
    user.radiusKm && user.radiusKm < 500 ? user.radiusKm : 200,
  );
  const savedRadius = Math.min(user.radiusKm ?? 500, 500);
  const isGlobalMode = (pendingRadius ?? savedRadius) >= 500;
  const savingRadius = pendingRadius !== null;
  const [radiusFailed, setRadiusFailed] = useState(false);

  async function saveRadius(radius: number) {
    if (savingRadius || radius === savedRadius) return;
    setRadiusFailed(false);
    try {
      await onChangeRadius(radius);
    } catch {
      if (savedRadius < 500) setDistance(savedRadius);
      setRadiusFailed(true);
    }
  }
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
    void saveOrientation(calculatedOrientation);
  }

  async function saveOrientation(value: "hetero" | "homo" | "bi") {
    onUpdateUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        orientation: value,
      };
    });

    const userId = user.id;
    if (userId && userId !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ orientation: value })
        .eq("id", userId);
      if (error) {
        console.error("[AssetDossier] Failed to update orientation in DB:", error);
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
      console.error("[dossier] openCamera failed:", err);
      toast.error("Kamera sa nespustila. Skontroluj, či má Antidote prístup ku kamere.");
      cancelRecording();
      return;
    }
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

    const mime = blob.type || "video/webm";
    const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
    // Upload to Storage
    const filename = `${userId}/slot_${index + 1}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("media-snippets").upload(filename, blob, {
      contentType: mime,
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      console.error("[dossier] upload error:", error);
      toast.error(`Ukladanie zlyhalo: ${error.message}`);
      throw error;
    }

    // Retrieve signed URL (bucket is private)
    const { data: signedData, error: signError } = await supabase.storage
      .from("media-snippets")
      .createSignedUrl(filename, 60 * 60 * 24 * 7);

    if (signError || !signedData?.signedUrl) {
      console.error("[dossier] signed url error:", signError);
      toast.error("Video je uložené, ale náhľad sa nepodarilo načítať.");
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
      toast.error("Video sa nepodarilo pridať do profilu.");
      throw dbError;
    }

    setSnippets((prev) => {
      const next = [...prev];
      next[index] = videoUrl;
      syncVideoUrls(next);
      return next;
    });
  }

  async function triggerRecord(stream: MediaStream, index: number, session: number) {
    if (sessionRef.current !== session) return;
    haptic("warning");
    setRecordingState("recording");

    try {
      const { blob } = await recordStreamForMs(stream, 3000, "video");
      if (sessionRef.current !== session) return;
      setRecordingState("saving");

      // Enforce max upload limit of 5 MB
      const maxLimit = 5 * 1024 * 1024;
      if (blob.size > maxLimit) {
        toast.error(`Súbor je príliš veľký (${(blob.size / 1024 / 1024).toFixed(2)} MB). Limit je 5 MB.`);
        throw new Error("File size exceeds 5MB limit");
      }

      await uploadFileAndSave(index, blob);
      haptic("success");
    } catch (err) {
      if (sessionRef.current !== session) return;
      console.error("[dossier] recordStreamForMs failed:", err);
      toast.error("Video sa nepodarilo nahrať alebo uložiť.");
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
            const finalBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "video/webm" });
            cleanup();
            if (finalBlob.size < 128) {
              reject(new Error("Compressed video is empty"));
              return;
            }
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

            const vWidth = video.videoWidth || canvas.width;
            const vHeight = video.videoHeight || canvas.height;
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

          mediaRecorder.start(250);
          drawFrame();

          const validDurationMs =
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : 3000;
          const maxDuration = Math.min(3000, validDurationMs);
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

    const isVideo =
      file.type.startsWith("video/") ||
      /\.(mp4|mov|webm|mkv|3gp|m4v|avi)$/i.test(file.name);
    if (!isVideo) {
      toast.error("Vyber súbor s videom.");
      setActiveUploadIndex(null);
      return;
    }

    // Enforce max upload limit of 30 MB (fallback raw limit)
    const maxLimit = 30 * 1024 * 1024;
    if (file.size > maxLimit) {
      toast.error(`Súbor je príliš veľký (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximálny limit je 30 MB.`);
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
      toast.error(`Nahrávanie zlyhalo: ${err.message || err}`);
    } finally {
      setIsUploading(false);
      setActiveUploadIndex(null);
    }
  }

  function requestDeleteSnippet(index: number) {
    haptic("tap");
    setConfirmDeleteIndex(index);
  }

  async function confirmDeleteSnippet() {
    if (confirmDeleteIndex === null) return;
    const index = confirmDeleteIndex;
    setConfirmDeleteIndex(null);
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
        toast.error("Video sa nepodarilo odstrániť z profilu.");
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
  const calculatedBracket = `${minBracketAge} – ${maxBracketAge < minBracketAge ? minBracketAge : maxBracketAge} rokov`;

  // Slovak attachment styles mapper
  const styleMap: Record<string, string> = {
    Secure: "Bezpečný",
    Anxious: "Úzkostný",
    Avoidant: "Vyhýbavý",
    Fearful: "Dezorganizovaný",
  };
  const attachmentStyleSlovak = styleMap[user.attachmentStyle || "Secure"] || "Bezpečný";
  const decisionLatencyValue = user.avgResponseTime || 2.45;
  const decisionLatency = `${decisionLatencyValue.toFixed(2)} s (${decisionLatencyValue < 2.5 ? "rýchle" : "rozvážne"})`;
  const cognitiveDepthPct = Math.round((user.cognitiveDepth ?? 0.55) * 100);
  const conscientiousnessPct = Math.round((user.conscientiousness ?? 0.5) * 100);
  const extraversionPct = Math.round((user.extraversion ?? 0.5) * 100);

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
          <SnippetRows snippets={snippets} onRecord={startRecording} onUpload={triggerFileUpload} onRemove={requestDeleteSnippet} />
          {confirmDeleteIndex !== null && (
            <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm" role="alertdialog" aria-label="Potvrdiť odstránenie videa">
              <p className="font-semibold text-destructive">Odstrániť video {confirmDeleteIndex + 1}?</p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => void confirmDeleteSnippet()} className="personal-action personal-danger flex-1">
                  Odstrániť
                </button>
                <button type="button" onClick={() => setConfirmDeleteIndex(null)} className="personal-action flex-1">
                  Zrušiť
                </button>
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} accept="video/*,video/mp4,video/quicktime,video/webm,video/3gpp,video/x-matroska" className="hidden" onChange={handleFileChange} />
        </section>

        {/* Market Parameters (Moved from settings to DNA section) */}
        <details className="personal-section profile-filters" open>
          <DisclosureSummary className="personal-summary">
            <span>
              <span className="personal-heading">Koho chceš spoznať?</span>
              <span className="summary-detail">{isGlobalMode ? "Celý svet" : `Do ${distance} km`}</span>
            </span>
          </DisclosureSummary>

          <div className="space-y-3 pt-3">
            {/* Global vs National Toggle */}
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-foreground/10 pb-3">
              <span className="font-medium">Rozsah vyhľadávania</span>
              <div className="personal-segments w-full sm:w-52" role="group" aria-label="Rozsah vyhľadávania">
                <button
                  onClick={() => {
                    haptic("tap");
                    void saveRadius(distance);
                  }}
                  disabled={savingRadius}
                  aria-pressed={!isGlobalMode}
                  className="personal-segment"
                >
                  V okolí
                </button>
                <button
                  onClick={() => {
                    haptic("tap");
                    void saveRadius(500);
                  }}
                  disabled={savingRadius}
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
              <Slider
                min={5}
                max={250}
                step={5}
                value={[distance]}
                disabled={isGlobalMode || savingRadius}
                onValueChange={([value]) => setDistance(value)}
                onValueCommit={([value]) => void saveRadius(value)}
                aria-label="Maximálna vzdialenosť"
                aria-valuetext={`${distance} km`}
                aria-describedby={isGlobalMode ? undefined : "nearby-radius-info"}
              />
              {!isGlobalMode && (
                <p id="nearby-radius-info" className="personal-status">
                  V Spojeniach uvidíš iba ľudí v nastavenej vzdialenosti.
                </p>
              )}
            </div>

            {savingRadius && <p role="status" className="personal-status">Ukladám dosah…</p>}
            {radiusFailed && (
              <p role="alert" className="text-destructive">
                Dosah sa nepodarilo uložiť. Skús to znova.
              </p>
            )}

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

        <details className="personal-section settings-disclosure group">
          <DisclosureSummary className="personal-summary">
            <span>
              <h2 className="personal-heading">Tvoja osobnosť</h2>
              <span className="summary-detail">Štýl väzby: {attachmentStyleSlovak}</span>
            </span>
          </DisclosureSummary>
          <div className="space-y-3.5 pt-3 pb-2 text-sm">
            <div className="flex items-center justify-between border-b border-foreground/10 pb-2.5">
              <span className="text-muted-foreground">Štýl väzby</span>
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-semibold text-accent">
                {attachmentStyleSlovak}
              </span>
            </div>
            <div className="space-y-1.5 border-b border-foreground/10 pb-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hĺbka uvažovania</span>
                <span className="font-semibold tabular-nums">{cognitiveDepthPct} %</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${cognitiveDepthPct}%` }} />
              </div>
            </div>
            <div className="space-y-1.5 border-b border-foreground/10 pb-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Svedomitosť</span>
                <span className="font-semibold tabular-nums">{conscientiousnessPct} %</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${conscientiousnessPct}%` }} />
              </div>
            </div>
            <div className="space-y-1.5 border-b border-foreground/10 pb-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extraverzia</span>
                <span className="font-semibold tabular-nums">{extraversionPct} %</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${extraversionPct}%` }} />
              </div>
            </div>
            <div className="flex justify-between border-b border-foreground/10 pb-2.5">
              <span className="text-muted-foreground">Tempo rozhodovania</span>
              <span className="font-semibold tabular-nums">{decisionLatency}</span>
            </div>
            <div className="flex justify-between border-b border-foreground/10 pb-2.5">
              <span className="text-muted-foreground">Vekové rozpätie zhôd</span>
              <span className="font-semibold tabular-nums">{calculatedBracket}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground">Stav profilu</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                Aktívny a pripravený
              </span>
            </div>
          </div>
        </details>
      </div>

      {/* Recording Overlay Modal */}
      {recordingIndex !== null && createPortal(
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="editorial-dock relative w-full max-w-xs p-4">
            <div className="mb-3 font-display text-lg font-bold">
              Nahrať moment
            </div>

            <div className="relative mx-auto mb-3 aspect-[3/4] w-[min(100%,12rem,40dvh)] overflow-hidden rounded-xl border border-foreground/15 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full bg-black object-contain"
                style={{ transform: "scaleX(-1)" }}
              />

              {recordingState === "countdown" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55">
                  <span className="font-display text-5xl font-bold text-white tabular-nums">
                    {countdown}
                  </span>
                  <span className="mt-1.5 text-xs font-medium text-white/75">
                    Priprav sa…
                  </span>
                </div>
              )}

              {recordingState === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" />
                  <span className="text-xs font-semibold text-white">
                    Nahráva sa · 3 s
                  </span>
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

      {isUploading && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="editorial-dock w-full max-w-xs space-y-3 p-6 text-center animate-fade-up">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-foreground">
              Spracúvam video…
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Komprimujem a ukladám tvoj moment. Môže to trvať niekoľko sekúnd.
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
