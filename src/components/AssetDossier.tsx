import { Slider } from "@/components/ui/slider";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Brain,
  Check,
  ChevronRight,
  Disc3,
  ExternalLink,
  Eye,
  Film,
  Globe,
  Heart,
  Loader2,
  MapPin,
  Music2,
  Pause,
  Pencil,
  Play,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PROFILE_SLOTS, SnippetRows } from "@/components/SnippetRows";
import { VideoRecorderModal } from "@/components/VideoRecorderModal";
import { MatchCardIdentity } from "@/components/MatchCardIdentity";
import { ConsentedVideos } from "@/components/ProfileVisibilityPreview";
import { ReflectionEditor } from "@/components/ReflectionEditor";
import {
  saveFavoriteSong,
  searchFavoriteSongs,
  type FavoriteSong,
  type MusicSearchResult,
} from "@/lib/favorite-song";
import { type UserProfile } from "@/lib/resonance";
import { useHaptic } from "@/hooks/use-haptics";
import { supabase } from "@/lib/supabase";
import { updateSharedReflection } from "@/lib/conversations";

interface AssetDossierProps {
  user: UserProfile;
  onUpdateUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  onBack: () => void;
  onSettings: () => void;
  pendingRadius: number | null;
  onChangeRadius: (radius: number) => Promise<void>;
}

type ProfileSheet = "reflection" | "preview" | "music" | "moments" | "filters" | "personality" | null;

const TARGET_LABELS: Record<"male" | "female" | "all", string> = {
  male: "Mužov",
  female: "Ženy",
  all: "Všetkých",
};

const ATTACHMENT_LABELS: Record<string, string> = {
  Secure: "Bezpečný",
  Anxious: "Úzkostný",
  Avoidant: "Vyhýbavý",
  Fearful: "Dezorganizovaný",
};

export function AssetDossier({
  user,
  onUpdateUser,
  onBack: _onBack,
  onSettings,
  pendingRadius,
  onChangeRadius,
}: AssetDossierProps) {
  const haptic = useHaptic();
  const profileHeader = useRef<HTMLElement>(null);

  useEffect(() => {
    profileHeader.current?.closest(".app-main-viewport")?.scrollTo({ top: 0 });
    profileHeader.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, []);

  const [activeSheet, setActiveSheet] = useState<ProfileSheet>(null);
  const [snippets, setSnippets] = useState<string[]>(user.videoUrls ?? []);
  useEffect(() => {
    setSnippets(user.videoUrls ?? []);
  }, [user.videoUrls]);

  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  const [distance, setDistance] = useState(
    user.radiusKm && user.radiusKm < 500 ? user.radiusKm : 200,
  );
  const savedRadius = Math.min(user.radiusKm ?? 500, 500);
  const effectiveRadius = pendingRadius ?? savedRadius;
  const isGlobalMode = effectiveRadius >= 500;
  const savingRadius = pendingRadius !== null;
  const [radiusFailed, setRadiusFailed] = useState(false);

  const [orientation, setOrientation] = useState(user.orientation || "hetero");
  useEffect(() => {
    setOrientation(user.orientation || "hetero");
  }, [user.orientation]);

  // Spotify favorite song state + audio preview player
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<MusicSearchResult[]>([]);
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [musicSearchError, setMusicSearchError] = useState("");
  const [savingMusic, setSavingMusic] = useState(false);
  const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  function stopPreviewAudio() {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPlayingPreviewUrl(null);
  }

  function togglePreviewAudio(url: string | null) {
    if (!url) return;
    haptic("tap");
    if (playingPreviewUrl === url) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    const audio = new Audio(url);
    audio.addEventListener("ended", () => {
      if (previewAudioRef.current === audio) setPlayingPreviewUrl(null);
    });
    audio.addEventListener("error", () => {
      if (previewAudioRef.current === audio) {
        setPlayingPreviewUrl(null);
        toast.error("Ukážku skladby sa nepodarilo prehrať.");
      }
    });
    previewAudioRef.current = audio;
    setPlayingPreviewUrl(url);
    void audio.play().catch(() => {
      setPlayingPreviewUrl(null);
    });
  }

  async function handleMusicSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = musicQuery.trim();
    if (trimmed.length < 2 || searchingMusic) return;
    haptic("tap");
    setSearchingMusic(true);
    setMusicSearchError("");
    try {
      const tracks = await searchFavoriteSongs(trimmed);
      setMusicResults(tracks);
      if (tracks.length === 0) {
        setMusicSearchError("Nenašla sa žiadna skladba. Skús iný názov alebo vlož odkaz zo Spotify.");
      }
    } catch {
      setMusicSearchError("Vyhľadávanie skladieb teraz zlyhalo. Skús to znova.");
    } finally {
      setSearchingMusic(false);
    }
  }

  async function handleSelectSong(song: FavoriteSong | null) {
    if (savingMusic) return;
    setSavingMusic(true);
    try {
      const userId = user.id || "00000000-0000-0000-0000-000000000001";
      const saved = await saveFavoriteSong(userId, song);
      stopPreviewAudio();
      onUpdateUser((previous) =>
        previous ? { ...previous, favoriteSong: saved } : previous,
      );
      haptic("success");
      setActiveSheet(null);
      toast.success(saved ? "Obľúbená skladba uložená." : "Skladba bola odstránená.");
    } catch {
      toast.error("Skladbu sa nepodarilo uložiť. Skús to znova.");
    } finally {
      setSavingMusic(false);
    }
  }

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

  function getTargetMarket(gender: string, orient: string): "male" | "female" | "all" {
    if (orient === "bi") return "all";
    if (orient === "homo") {
      return gender === "female" ? "female" : "male";
    }
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
    onUpdateUser((prev) => (prev ? { ...prev, orientation: calculatedOrientation } : null));

    const userId = user.id;
    if (userId && userId !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ orientation: calculatedOrientation })
        .eq("id", userId);
      if (error) {
        console.error("[AssetDossier] Failed to update orientation in DB:", error);
      }
    }
  }

  function syncVideoUrls(urls: string[]) {
    onUpdateUser((prev) => (prev ? { ...prev, videoUrls: urls } : null));
  }

  function startRecording(index: number) {
    haptic("tap");
    setRecordingIndex(index);
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
        if (video.parentNode) document.body.removeChild(video);
        URL.revokeObjectURL(objectUrl);
      };

      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Could not get canvas context"));
        return;
      }

      video.onloadedmetadata = () => {
        video
          .play()
          .then(() => {
            const stream = canvas.captureStream(30);
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
              if (event.data && event.data.size > 0) chunks.push(event.data);
            };
            mediaRecorder.onstop = () => {
              const finalBlob = new Blob(chunks, {
                type: mediaRecorder.mimeType || "video/webm",
              });
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
                if (mediaRecorder.state === "recording") mediaRecorder.stop();
                return;
              }
              const vWidth = video.videoWidth || canvas.width;
              const vHeight = video.videoHeight || canvas.height;
              const targetWidth = canvas.width;
              const targetHeight = canvas.height;
              const vRatio = vWidth / vHeight;
              const targetRatio = targetWidth / targetHeight;
              let sx = 0,
                sy = 0,
                sWidth = vWidth,
                sHeight = vHeight;
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
            setTimeout(() => {
              if (mediaRecorder.state === "recording") video.pause();
            }, Math.min(3000, validDurationMs));
          })
          .catch((err) => {
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

  async function uploadFileAndSave(index: number, blob: Blob | File) {
    const userId = user.id || "00000000-0000-0000-0000-000000000001";
    if (userId === "00000000-0000-0000-0000-000000000001") {
      const videoUrl = URL.createObjectURL(blob);
      setSnippets((prev) => {
        const next = [...prev];
        next[index] = videoUrl;
        syncVideoUrls(next);
        return next;
      });
      return;
    }

    const rawMime = blob.type || "video/webm";
    const mime = rawMime.split(";")[0].trim() || "video/webm";
    const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
    const filename = `${userId}/slot_${index + 1}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media-snippets").upload(filename, blob, {
      contentType: mime,
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw error;

    const { data: signedData, error: signError } = await supabase.storage
      .from("media-snippets")
      .createSignedUrl(filename, 60 * 60 * 24 * 7);
    if (signError || !signedData?.signedUrl) {
      toast.error("Video je uložené, ale náhľad sa nepodarilo načítať.");
      throw signError || new Error("Signed URL failed");
    }

    const videoUrl = signedData.signedUrl;
    const { error: dbError } = await supabase
      .from("media_snippets")
      .upsert(
        { user_id: userId, slot_index: index + 1, video_url: videoUrl },
        { onConflict: "user_id, slot_index" },
      );
    if (dbError) {
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

  async function saveCapturedSnippet(index: number, blob: Blob) {
    let uploadBlob: Blob = blob;
    const maxLimit = 5 * 1024 * 1024;
    if (
      uploadBlob.size > 4.5 * 1024 * 1024 &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      typeof window.MediaRecorder === "function"
    ) {
      try {
        uploadBlob = await compressVideo(
          new File([blob], "moment.webm", { type: blob.type || "video/webm" }),
        );
      } catch (compressErr) {
        console.warn("[dossier] camera compression skipped:", compressErr);
      }
    }
    if (uploadBlob.size > maxLimit) {
      throw new Error(
        `Súbor je príliš veľký (${(uploadBlob.size / 1024 / 1024).toFixed(2)} MB). Limit je 5 MB.`,
      );
    }
    await uploadFileAndSave(index, uploadBlob);
  }

  function triggerFileUpload(index: number) {
    haptic("tap");
    setActiveUploadIndex(index);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const index = activeUploadIndex;
    if (index === null) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|3gp|m4v|avi)$/i.test(file.name);
    if (!isVideo) {
      toast.error("Vyber súbor s videom.");
      setActiveUploadIndex(null);
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      toast.error(
        `Súbor je príliš veľký (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximálny limit je 30 MB.`,
      );
      setActiveUploadIndex(null);
      return;
    }

    setIsUploading(true);
    try {
      let uploadBlob: Blob | File = file;
      if (
        typeof HTMLCanvasElement.prototype.captureStream === "function" &&
        typeof window.MediaRecorder === "function"
      ) {
        try {
          uploadBlob = await compressVideo(file);
        } catch (compressErr) {
          console.warn(
            "[dossier] Client-side video compression failed, using original file:",
            compressErr,
          );
        }
      }
      haptic("warning");
      await uploadFileAndSave(index, uploadBlob);
      haptic("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Nahrávanie zlyhalo: ${msg}`);
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
        toast.error("Video sa nepodarilo odstrániť z profilu.");
        return;
      }
    }

    setSnippets((prev) => {
      const next = [...prev];
      next[index] = "";
      syncVideoUrls(next);
      return next;
    });
  }

  const minBracketAge = Math.max(18, Math.floor(user.age / 2 + 7));
  const maxBracketAge = Math.floor((user.age - 7) * 2);
  const calculatedBracket = `${minBracketAge} – ${maxBracketAge < minBracketAge ? minBracketAge : maxBracketAge} rokov`;
  const attachmentStyleSlovak = ATTACHMENT_LABELS[user.attachmentStyle || "Secure"] || "Bezpečný";
  const decisionLatencyValue = user.avgResponseTime || 2.45;
  const decisionLatency = `${decisionLatencyValue.toFixed(2)} s (${decisionLatencyValue < 2.5 ? "rýchle" : "rozvážne"})`;
  const cognitiveDepthPct = Math.round((user.cognitiveDepth ?? 0.55) * 100);
  const conscientiousnessPct = Math.round((user.conscientiousness ?? 0.5) * 100);
  const extraversionPct = Math.round((user.extraversion ?? 0.5) * 100);
  const filledVideos = snippets.filter(Boolean).length;
  const targetMarket = getTargetMarket(user.gender, orientation);
  const song = user.favoriteSong ?? null;

  return (
    <>
      <div className="personal-screen profile-bento-page">
        <header ref={profileHeader} className="profile-bento-topbar">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 tabIndex={-1} className="profile-bento-heading">
              Môj profil
            </h1>
            <span className="settings-status-pill" data-ok="true">
              Aktívny
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              onSettings();
            }}
            aria-label="Nastavenia"
            className="personal-icon-button profile-bento-settings-btn"
          >
            <Settings className="size-5" aria-hidden="true" />
          </button>
        </header>

        {/* Hero: Live card as seen by others in Discover */}
        <article
          className="match-card profile-bento-hero"
          data-tone={user.topPriority}
          aria-label="Náhľad tvojej karty v Spojeniach"
        >
          <MatchCardIdentity
            name={user.name}
            age={user.age}
            city={user.city}
            orbSeed={user.id || user.name}
            heading="h2"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              Takto ťa vidia v Spojeniach
            </span>
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setActiveSheet("preview");
              }}
              className="profile-bento-inline-pill shrink-0"
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Po súhlase
            </button>
          </div>

          <div className="match-card-reflection">
            <div className="flex items-center justify-between gap-2">
              <span className="match-card-reflection-label">Tvoja zdieľaná odpoveď</span>
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  setActiveSheet("reflection");
                }}
                className="profile-bento-edit-link"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                {user.sharedReflection ? "Upraviť" : "Pridať"}
              </button>
            </div>
            {user.sharedReflection ? (
              <blockquote>„{user.sharedReflection}“</blockquote>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Pridaj odpoveď k hodnote, ktorú ostatní uvidia priamo na tvojej karte.
              </p>
            )}
          </div>
        </article>

        {/* Bento Tiles */}
        <section className="profile-bento-grid" aria-label="Menu karty profilu">
          {/* Full-width Spotify Favorite Track Bento Card */}
          <div className="profile-bento-tile profile-bento-spotify">
            <div className="flex items-center justify-between gap-2">
              <span className="profile-bento-spotify-badge">
                <span className="profile-bento-spotify-dot" aria-hidden="true" />
                Spotify · Obľúbená skladba
              </span>
              {song && (
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setActiveSheet("music");
                  }}
                  className="profile-bento-edit-link"
                >
                  Zmeniť
                </button>
              )}
            </div>

            {song ? (
              <div className="profile-bento-song-row">
                <div className="profile-bento-song-cover">
                  {song.artworkUrl ? (
                    <img
                      src={song.artworkUrl}
                      alt={`${song.title} – ${song.artist}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Disc3 className="size-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-foreground">
                    {song.title}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{song.artist}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {song.previewUrl && (
                    <button
                      type="button"
                      onClick={() => togglePreviewAudio(song.previewUrl)}
                      aria-label={
                        playingPreviewUrl === song.previewUrl
                          ? `Pozastaviť ukážku ${song.title}`
                          : `Prehrať ukážku ${song.title}`
                      }
                      className="profile-bento-play-btn"
                      data-playing={playingPreviewUrl === song.previewUrl}
                    >
                      {playingPreviewUrl === song.previewUrl ? (
                        <Pause className="size-4" aria-hidden="true" />
                      ) : (
                        <Play className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <a
                    href={song.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Otvoriť ${song.title} v Spotify`}
                    className="profile-bento-open-spotify"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-foreground">
                    Pridaj svoju hymnu zo Spotify
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Vyhľadaj skladbu alebo vlož odkaz zo Spotify.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setActiveSheet("music");
                  }}
                  className="personal-action shrink-0 inline-flex items-center gap-2"
                >
                  <Music2 className="size-4" aria-hidden="true" />
                  Vybrať skladbu
                </button>
              </div>
            )}
          </div>

          {/* Full-width Video Moments Bento Card */}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setActiveSheet("moments");
            }}
            className="profile-bento-tile profile-bento-span-2 text-left"
          >
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="profile-bento-icon-box">
                  <Film className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-base font-bold text-foreground">Videomomenty</p>
                  <p className="text-xs text-muted-foreground">
                    Odomknú sa až po vzájomnom súhlase
                  </p>
                </div>
              </div>
              <span className="settings-status-pill shrink-0 whitespace-nowrap" data-ok={filledVideos > 0}>
                {filledVideos} / 4
              </span>
            </div>
            <div className="profile-bento-slots-strip" aria-hidden="true">
              {PROFILE_SLOTS.map((idx) => (
                <span key={idx} data-filled={Boolean(snippets[idx])}>
                  {snippets[idx] ? `Video ${idx + 1}` : `+ Slot ${idx + 1}`}
                </span>
              ))}
            </div>
          </button>

          {/* Left Tile: Search Radius */}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setActiveSheet("filters");
            }}
            className="profile-bento-tile text-left"
          >
            <span className="profile-bento-icon-box">
              {isGlobalMode ? (
                <Globe className="size-5" aria-hidden="true" />
              ) : (
                <MapPin className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="mt-1">
              <p className="text-xs font-medium text-muted-foreground">Okruh hľadania</p>
              <p className="font-display text-lg font-bold text-foreground">
                {isGlobalMode ? "Celý svet" : `Do ${effectiveRadius} km`}
              </p>
            </div>
          </button>

          {/* Right Tile: Looking For */}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setActiveSheet("filters");
            }}
            className="profile-bento-tile text-left"
          >
            <span className="profile-bento-icon-box" data-tone="coral">
              <Heart className="size-5" aria-hidden="true" />
            </span>
            <div className="mt-1">
              <p className="text-xs font-medium text-muted-foreground">Koho hľadáš</p>
              <p className="font-display text-lg font-bold text-foreground">
                {TARGET_LABELS[targetMarket]}
              </p>
            </div>
          </button>

          {/* Bottom Left Tile: Personality */}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setActiveSheet("personality");
            }}
            className="profile-bento-tile text-left"
          >
            <span className="profile-bento-icon-box">
              <Brain className="size-5" aria-hidden="true" />
            </span>
            <div className="mt-1">
              <p className="text-xs font-medium text-muted-foreground">Osobnosť</p>
              <p className="font-display text-base font-bold text-foreground">
                {attachmentStyleSlovak}
              </p>
              <p className="text-xs text-muted-foreground">Hĺbka {cognitiveDepthPct} %</p>
            </div>
          </button>

          {/* Bottom Right Tile: App Settings */}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              onSettings();
            }}
            className="profile-bento-tile text-left"
          >
            <div className="flex w-full items-center justify-between">
              <span className="profile-bento-icon-box">
                <SlidersHorizontal className="size-5" aria-hidden="true" />
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="mt-1">
              <p className="text-xs font-medium text-muted-foreground">Aplikácia</p>
              <p className="font-display text-base font-bold text-foreground">Nastavenia</p>
              <p className="text-xs text-muted-foreground">Vzhľad a súkromie</p>
            </div>
          </button>
        </section>
      </div>

      {/* Bottom Sheet: Shared Reflection Editor */}
      <Drawer
        open={activeSheet === "reflection"}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Zdieľaná odpoveď</DrawerTitle>
            <DrawerDescription>
              Zobrazuje sa priamo na tvojej karte v Spojeniach.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            {user.id && (
              <ReflectionEditor
                key={user.id}
                initialValue={user.sharedReflection}
                onSave={async (value) => {
                  await updateSharedReflection(user.id!, value);
                  onUpdateUser((previous) =>
                    previous && previous.id === user.id
                      ? { ...previous, sharedReflection: value }
                      : previous,
                  );
                  setActiveSheet(null);
                }}
              />
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Zavrieť
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Consented Videos Visibility Preview */}
      <Drawer
        open={activeSheet === "preview"}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Po vzájomnom súhlase</DrawerTitle>
            <DrawerDescription>
              Tieto profilové videá sa sprístupnia v rozhovore, keď so zdieľaním súhlasíte obaja.
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[55dvh] overflow-y-auto px-4 pb-2">
            {user.id ? (
              <ConsentedVideos key={user.id} ownerId={user.id} savedVideos={user.videoUrls} />
            ) : (
              <p className="text-sm text-muted-foreground">Na profile zatiaľ nemáš žiadne videá.</p>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Hotovo
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Spotify Favorite Music Picker */}
      <Drawer
        open={activeSheet === "music"}
        onOpenChange={(open) => {
          if (!open) {
            stopPreviewAudio();
            setActiveSheet(null);
          }
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Obľúbená skladba zo Spotify</DrawerTitle>
            <DrawerDescription>
              Vyhľadaj interpreta alebo názov skladby, prípadne vlož priamy odkaz zo Spotify.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4 pb-2">
            <form onSubmit={(e) => void handleMusicSearch(e)} className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={musicQuery}
                  onChange={(e) => setMusicQuery(e.target.value)}
                  placeholder="Názov skladby alebo link zo Spotify…"
                  aria-label="Vyhľadať skladbu alebo vložiť odkaz zo Spotify"
                  className="min-h-12 w-full rounded-full border-0 bg-muted py-2.5 pr-4 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-accent"
                />
              </div>
              <button
                type="submit"
                disabled={searchingMusic || musicQuery.trim().length < 2}
                className="personal-action shrink-0"
              >
                {searchingMusic ? "Hľadám…" : "Hľadať"}
              </button>
            </form>

            {musicSearchError && (
              <p role="alert" className="text-sm text-destructive">
                {musicSearchError}
              </p>
            )}

            {musicResults.length > 0 && (
              <ul className="max-h-[38dvh] space-y-2 overflow-y-auto pr-0.5">
                {musicResults.map((track) => {
                  const isCurrent =
                    song?.title === track.title && song?.artist === track.artist;
                  const isPlaying = Boolean(track.previewUrl && playingPreviewUrl === track.previewUrl);
                  return (
                    <li
                      key={track.id}
                      className="flex items-center gap-3 rounded-2xl bg-muted/70 p-2.5"
                    >
                      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-background">
                        {track.artworkUrl ? (
                          <img
                            src={track.artworkUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="grid size-full place-items-center text-muted-foreground">
                            <Disc3 className="size-5" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{track.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                      </div>
                      {track.previewUrl && (
                        <button
                          type="button"
                          onClick={() => togglePreviewAudio(track.previewUrl)}
                          aria-label={
                            isPlaying
                              ? `Pozastaviť ukážku ${track.title}`
                              : `Prehrať ukážku ${track.title}`
                          }
                          className="personal-icon-button shrink-0 bg-card"
                        >
                          {isPlaying ? (
                            <Pause className="size-4" aria-hidden="true" />
                          ) : (
                            <Play className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingMusic}
                        onClick={() => void handleSelectSong(track)}
                        className="personal-action shrink-0 bg-accent text-accent-foreground"
                      >
                        {isCurrent ? <Check className="size-4" aria-hidden="true" /> : "Vybrať"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {song && (
              <button
                type="button"
                disabled={savingMusic}
                onClick={() => void handleSelectSong(null)}
                className="settings-danger-row w-full justify-center"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span>Odstrániť skladbu z profilu</span>
              </button>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Zavrieť
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Video Moments Manager */}
      <Drawer
        open={activeSheet === "moments"}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Tvoje momenty</DrawerTitle>
            <DrawerDescription>
              Vo vašom rozhovore sa videá sprístupnia až po súhlase vás oboch.
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[58dvh] overflow-y-auto px-4 pb-2">
            <div
              className="moment-progress"
              aria-label={`Pridané videá: ${filledVideos} zo 4`}
            >
              <span className="moment-progress-label">{filledVideos} / 4 videá</span>
              <span className="moment-progress-track" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} data-filled={!!snippets[index]} />
                ))}
              </span>
            </div>
            <SnippetRows
              snippets={snippets}
              onRecord={startRecording}
              onUpload={triggerFileUpload}
              onRemove={requestDeleteSnippet}
            />
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Hotovo
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Discovery Filters */}
      <Drawer
        open={activeSheet === "filters"}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Koho chceš spoznať?</DrawerTitle>
            <DrawerDescription>Nastav si vzdialenosť a koho v aplikácii hľadáš.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 pb-3">
              <span className="font-medium">Rozsah vyhľadávania</span>
              <div
                className="personal-segments w-full sm:w-52"
                role="group"
                aria-label="Rozsah vyhľadávania"
              >
                <button
                  type="button"
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
                  type="button"
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

            <div
              className={
                isGlobalMode ? "pointer-events-none opacity-30 transition-opacity" : "transition-opacity"
              }
            >
              <div className="mb-1 flex justify-between">
                <span className="text-sm font-medium text-foreground/75">
                  Maximálna vzdialenosť
                </span>
                <span className="font-bold text-accent">{distance} km</span>
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
              />
              {!isGlobalMode && (
                <p className="personal-status mt-2">
                  V Spojeniach uvidíš iba ľudí v nastavenej vzdialenosti.
                </p>
              )}
            </div>

            {savingRadius && (
              <p role="status" className="personal-status">
                Ukladám dosah…
              </p>
            )}
            {radiusFailed && (
              <p role="alert" className="text-destructive">
                Dosah sa nepodarilo uložiť. Skús to znova.
              </p>
            )}

            <fieldset>
              <legend className="mb-2 font-medium">Koho hľadáš</legend>
              <div className="personal-segments profile-target-choices">
                {(
                  [
                    ["male", "Mužov"],
                    ["female", "Ženy"],
                    ["all", "Všetkých"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="personal-segment"
                    aria-pressed={targetMarket === value}
                    onClick={() => {
                      if (targetMarket === value) return;
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
          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Hotovo
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Personality Stats */}
      <Drawer
        open={activeSheet === "personality"}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Tvoja osobnosť</DrawerTitle>
            <DrawerDescription>Výsledky z úvodného kognitívneho profilu.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3.5 px-4 pb-2 text-sm">
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
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${cognitiveDepthPct}%` }}
                />
              </div>
            </div>
            <div className="space-y-1.5 border-b border-foreground/10 pb-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Svedomitosť</span>
                <span className="font-semibold tabular-nums">{conscientiousnessPct} %</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${conscientiousnessPct}%` }}
                />
              </div>
            </div>
            <div className="space-y-1.5 border-b border-foreground/10 pb-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extraverzia</span>
                <span className="font-semibold tabular-nums">{extraversionPct} %</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${extraversionPct}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between border-b border-foreground/10 pb-2.5">
              <span className="text-muted-foreground">Tempo rozhodovania</span>
              <span className="font-semibold tabular-nums">{decisionLatency}</span>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="text-muted-foreground">Vekové rozpätie zhôd</span>
              <span className="font-semibold tabular-nums">{calculatedBracket}</span>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <button type="button" className="personal-action w-full justify-center">
                Zavrieť
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom Sheet: Confirm Delete Video Snippet */}
      <Drawer
        open={confirmDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteIndex(null);
        }}
      >
        <DrawerContent className="mx-auto max-w-md rounded-t-[1.75rem] border-border bg-card text-foreground">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 font-display text-xl text-destructive">
              <Trash2 className="size-5 shrink-0" aria-hidden="true" />
              <span>
                {confirmDeleteIndex !== null
                  ? `Odstrániť video ${confirmDeleteIndex + 1}?`
                  : "Odstrániť video?"}
              </span>
            </DrawerTitle>
            <DrawerDescription>
              Tento krátky moment vymažeš z profilu a môžeš kedykoľvek nahrať nový.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="gap-2 pt-2">
            <button
              type="button"
              onClick={() => void confirmDeleteSnippet()}
              className="personal-action personal-danger w-full justify-center rounded-full"
            >
              Odstrániť video
            </button>
            <DrawerClose asChild>
              <button
                type="button"
                onClick={() => setConfirmDeleteIndex(null)}
                className="personal-action w-full justify-center rounded-full"
              >
                Zrušiť
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <input
        type="file"
        ref={fileInputRef}
        accept="video/*,video/mp4,video/quicktime,video/webm,video/3gpp,video/x-matroska"
        className="hidden"
        onChange={handleFileChange}
      />

      <VideoRecorderModal
        slotIndex={recordingIndex}
        title="Nahrať moment"
        onCapture={saveCapturedSnippet}
        onClose={() => setRecordingIndex(null)}
      />

      {isUploading &&
        createPortal(
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
          document.body,
        )}
    </>
  );
}
