import { useState, useRef, useEffect } from "react";
import { ArrowRight, X } from "lucide-react";
import { UserProfile, RankedMatch } from "@/lib/resonance";
import { useHaptic } from "@/hooks/use-haptics";
import { IcebreakerDilemma } from "@/components/IcebreakerDilemma";
import { BlindVote } from "@/components/BlindVote";
import { VoiceBubble, VoiceMsg } from "@/components/chat/VoiceBubble";
import { RecordButton } from "@/components/chat/RecordButton";
import { pickAudioMime, createMediaRecorder, stopStream } from "@/lib/media";
import {
  supabase,
  getOrCreateMatch,
  submitBlindVote,
  uploadVoiceMessageBlob,
  getSignedMediaUrl,
} from "@/lib/supabase";

const MAX_REC_SECONDS = 60;
const PEAK_BINS = 24;

function normalizePeaks(samples: number[]): number[] {
  if (samples.length === 0) {
    return Array.from({ length: PEAK_BINS }, (_, i) =>
      Math.min(0.95, Math.max(0.2, 0.35 + Math.abs(Math.sin(i * 0.7)) * 0.5)),
    );
  }
  const maxAmp = Math.max(0.08, ...samples);
  return Array.from({ length: PEAK_BINS }, (_, bin) => {
    const start = Math.floor((bin / PEAK_BINS) * samples.length);
    const end = Math.max(start + 1, Math.floor(((bin + 1) / PEAK_BINS) * samples.length));
    let peak = 0;
    for (let i = start; i < end && i < samples.length; i++) {
      if (samples[i] > peak) peak = samples[i];
    }
    return Math.min(1, Math.max(0.18, peak / maxAmp));
  });
}

export function Chamber({
  user,
  match,
  myVideoUrl,
  onSuccess,
  onDiscard,
  onFairInteraction,
}: {
  user: UserProfile;
  match: RankedMatch;
  myVideoUrl?: string;
  onSuccess: (blur: number) => void;
  onDiscard: () => void;
  onFairInteraction: () => void;
}) {
  const haptic = useHaptic();
  const [messages, setMessages] = useState<VoiceMsg[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recLen, setRecLen] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [draftVoice, setDraftVoice] = useState<{
    id: string;
    blob: Blob;
    url: string;
    duration: number;
    peaks: number[];
  } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [stage, setStage] = useState<
    "voice" | "blindVote" | "waiting" | "result-no" | "result-yes"
  >("voice");
  const [unblurred, setUnblurred] = useState(false);
  const [myChoice, setMyChoice] = useState<"unlock" | "cancel" | null>(null);
  const [theirChoice, setTheirChoice] = useState<"unlock" | "cancel" | null>(null);
  void theirChoice;
  const [supabaseMatchId, setSupabaseMatchId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let channel: any = null;

    async function initMatch() {
      try {
        const result = await getOrCreateMatch(user.id!, match.id, match.score);
        if (!active) return;
        const { data: dbMessages, error } = await supabase
          .from("messages")
          .select("*")
          .eq("match_id", result.id)
          .order("created_at", { ascending: true });

        if (error) {
          throw error;
        } else if (dbMessages && active) {
          const resolved = await Promise.all(
            dbMessages.map(async (m: any): Promise<VoiceMsg> => ({
              id: m.id,
              from: m.sender_id === user.id ? "me" : "them",
              duration: m.duration || 0,
              audioUrl: await getSignedMediaUrl("voice-messages", m.media_url),
            })),
          );
          if (active) {
            setMessages(resolved);
          }
        }

        channel = supabase
          .channel(`chamber:${result.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `match_id=eq.${result.id}`,
            },
            async (payload) => {
              const newMsg = payload.new;
              if (newMsg.sender_id !== user.id) {
                const signedAudioUrl = await getSignedMediaUrl("voice-messages", newMsg.media_url);
                setMessages((prev) => {
                  if (prev.some((x) => x.id === newMsg.id)) return prev;
                  return [
                    ...prev,
                    {
                      id: newMsg.id,
                      from: "them",
                      duration: newMsg.duration || 0,
                      audioUrl: signedAudioUrl,
                    },
                  ];
                });
              }
            },
          )
          .subscribe();
        if (active) setSupabaseMatchId(result.id);
      } catch (err) {
        console.error("[Chamber] Init match failed:", err);
        if (active) setConnectionError(true);
      }
    }

    if (user.id && match.id && !user.id.startsWith("00000000")) {
      initMatch();
    } else {
      setConnectionError(true);
    }

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user.id, match.id, connectionAttempt]);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const peakSamplesRef = useRef<number[]>([]);
  const draftUrlRef = useRef<string | null>(null);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingStopRef = useRef<Promise<void> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    draftUrlRef.current = draftVoice?.url ?? null;
  }, [draftVoice]);

  useEffect(() => {
    if (stage !== "result-yes") {
      setUnblurred(false);
      return;
    }
    const t = setTimeout(() => setUnblurred(true), 120);
    return () => clearTimeout(t);
  }, [stage]);

  function stopAudioMeter() {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setLiveLevel(0);
  }

  // Voice progress details
  const totalVoiceDuration = messages.reduce((sum, msg) => sum + msg.duration, 0);
  const progressPct = Math.min(100, Math.round((totalVoiceDuration / 180) * 100));
  const roundIndex = Math.min(2, Math.floor(totalVoiceDuration / 60));
  const secondsInRound = Math.min(60, totalVoiceDuration - roundIndex * 60);
  const roundSecondsLeft = Math.max(0, 60 - secondsInRound);
  const rounds = [
    {
      label: "Prvá reakcia",
      prompt: "Odpovedz bez stratégie. Čo ti napadlo ako prvé a prečo?",
      helper: "Obaja začínate rovnakou otázkou.",
    },
    {
      label: "Počúvaj a reaguj",
      prompt: `Vyber jednu myšlienku od ${match.name} a povedz, čo v tebe otvorila.`,
      helper: "Nesnaž sa presvedčiť. Skús najprv porozumieť.",
    },
    {
      label: "Tvoja otázka",
      prompt: `Polož ${match.name} jednu otázku, ktorú by si na bežnom rande neodložil/a na neskôr.`,
      helper: "Jedna konkrétna otázka je lepšia než ďalšie predstavenie sa.",
    },
  ] as const;
  const currentRound = rounds[roundIndex];

  // Clamped progressive blur: reduces from 40px down to minimum 15px before Unlock
  const blurPx = Math.max(15, 40 * (1.0 - totalVoiceDuration / 180));

  // Check if cumulative voice limit of 180s is reached
  useEffect(() => {
    if (totalVoiceDuration >= 180 && stage === "voice" && !draftVoice && !recording && !sending) {
      haptic("warning");
      setStage("blindVote");
    }
  }, [totalVoiceDuration, stage, haptic, draftVoice, recording, sending]);

  // Cleanup mic + object URLs on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      stopAudioMeter();
      if (draftUrlRef.current && draftUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(draftUrlRef.current);
      }
      try {
        if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
          mediaRecRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      if (micStreamRef.current) stopStream(micStreamRef.current);
      setMessages((m) => {
        m.forEach((x) => {
          if (x.audioUrl && x.audioUrl.startsWith("blob:")) {
            URL.revokeObjectURL(x.audioUrl);
          }
        });
        return m;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickMime(): string {
    return pickAudioMime();
  }

  async function startRec() {
    if (stage !== "voice" || recording || !supabaseMatchId || sendingRef.current) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const msg = "Tento prehliadač nepodporuje nahrávanie z mikrofónu.";
      console.warn("[voice]", msg);
      setMicError(msg);
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      const msg = "Tvoj prehliadač nepodporuje MediaRecorder API.";
      console.warn("[voice]", msg);
      setMicError(msg);
      return;
    }

    pendingStopRef.current = null;
    cancelledRef.current = false;
    peakSamplesRef.current = [];
    setMicError(null);
    setRecLen(0);
    setPlaying(null);
    setRecording(true);
    recStartRef.current = performance.now();

    try {
      const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (perms?.query) {
        const status = await perms.query({ name: "microphone" as PermissionName });
        if (status.state === "denied") {
          console.warn("[voice] microphone permission denied");
          setMicError(
            "Mikrofón je zablokovaný. Klikni na ikonu zámku v adresnom riadku a povoľ mikrofón.",
          );
          setRecording(false);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          let lastSampleAt = 0;
          const sampleLoop = (now: number) => {
            analyser.getByteTimeDomainData(data);
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
              const centered = (data[i] - 128) / 128;
              sumSq += centered * centered;
            }
            const rms = Math.min(1, Math.sqrt(sumSq / data.length) * 3.4);
            setLiveLevel(rms);
            if (now - lastSampleAt >= 90) {
              peakSamplesRef.current.push(rms);
              lastSampleAt = now;
            }
            meterRafRef.current = requestAnimationFrame(sampleLoop);
          };
          meterRafRef.current = requestAnimationFrame(sampleLoop);
        }
      } catch {
        /* fallback if Web Audio API is unavailable */
      }

      const mime = pickMime() || "audio/webm";
      const rec = createMediaRecorder(stream, mime, "audio");
      mediaRecRef.current = rec;

      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const stopPromise = new Promise<void>((resolve) => {
        rec.onstop = () => {
          stopAudioMeter();
          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          if (micStreamRef.current) stopStream(micStreamRef.current);
          micStreamRef.current = null;

          if (cancelledRef.current) {
            resolve();
            return;
          }

          const elapsed = (performance.now() - recStartRef.current) / 1000;
          if (elapsed < 1.0) {
            setMicError("Hlasovka je príliš krátka.");
            resolve();
            return;
          }

          const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || mime }) : null;
          if (!blob || blob.size === 0) {
            setMicError("Nepodarilo sa nahrať zvuk (prázdny súbor).");
            resolve();
            return;
          }

          const dur = Math.min(MAX_REC_SECONDS, Math.round(elapsed));
          const url = URL.createObjectURL(blob);
          const peaks = normalizePeaks(peakSamplesRef.current);

          setDraftVoice((prev) => {
            if (prev?.url && prev.url.startsWith("blob:")) {
              URL.revokeObjectURL(prev.url);
            }
            return { id: crypto.randomUUID(), blob, url, duration: dur, peaks };
          });
          resolve();
        };
      });

      pendingStopRef.current = stopPromise;
      rec.start(100);

      tickRef.current = setInterval(() => {
        const sec = (performance.now() - recStartRef.current) / 1000;
        setRecLen(sec);
        if (sec >= MAX_REC_SECONDS) stopRec(true);
      }, 250);
    } catch (err) {
      stopAudioMeter();
      console.error("[voice] start recording failed:", err);
      const e = err as Error;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicError(
          "Prístup k mikrofónu bol zamietnutý. Povoľ ho prosím v nastaveniach prehliadača.",
        );
      } else {
        setMicError(`Nepodarilo sa spustiť mikrofón: ${e.message}`);
      }
      setRecording(false);
    }
  }

  async function stopRec(commit: boolean) {
    if (!recording) return;
    cancelledRef.current = !commit;
    setRecording(false);
    stopAudioMeter();
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    const rec = mediaRecRef.current;
    if (!rec) {
      if (micStreamRef.current) stopStream(micStreamRef.current);
      micStreamRef.current = null;
      return;
    }
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch (err) {
      console.warn("[voice] stop error:", err);
    }
    mediaRecRef.current = null;
  }

  function discardDraftVoice() {
    setDraftVoice((prev) => {
      if (prev?.url && prev.url.startsWith("blob:")) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }

  async function sendDraftVoice() {
    if (!draftVoice || !supabaseMatchId || !user.id || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMicError(null);
    const { id, blob, url, duration, peaks } = draftVoice;
    try {
      const dbMsg = await uploadVoiceMessageBlob(supabaseMatchId, user.id, blob, duration, id);
      setMessages((prev) => prev.some((message) => message.id === dbMsg.id)
        ? prev
        : [...prev, { id: dbMsg.id, from: "me", duration, audioUrl: url, peaks }]);
      setDraftVoice(null);
    } catch (err) {
      console.error("[Chamber] Failed to upload voice message:", err);
      setMicError("Správu sa nepodarilo odoslať. Nahrávka zostala pripravená, skús to znova.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="-mx-5 min-h-[100dvh] night-radio px-5 py-2 animate-fade-up">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between border-b border-foreground/25 pb-4">
        <div>
          <p className="text-xs font-medium text-cerebral">Hlasový rozhovor</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.055em]">
            {match.name}
            <span className="ml-2 text-base font-medium text-foreground/40">{match.age}</span>
          </h1>
        </div>
        <span className="text-xs text-foreground/65">Kolo {roundIndex + 1} z 3</span>
      </div>

      <div className="mb-6 grid grid-cols-3 border-y border-foreground/20">
        {rounds.map((round, index) => {
          const complete = totalVoiceDuration >= (index + 1) * 60;
          const active = index === roundIndex && stage === "voice";
          return (
            <div
              key={round.label}
              className={`relative px-2 py-4 text-center ${
                index > 0 ? "border-l border-foreground/20" : ""
              } ${active ? "bg-foreground/[0.06]" : ""}`}
            >
              <span
                className={`mx-auto mb-2 grid size-6 place-items-center rounded-full border font-mono text-xs ${
                  complete
                    ? "border-cerebral bg-cerebral text-background"
                    : active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-foreground/20 text-foreground/35"
                }`}
              >
                {complete ? "✓" : index + 1}
              </span>
              <span
                className={`block text-xs leading-tight ${
                  active ? "font-semibold text-foreground" : "text-foreground/40"
                }`}
              >
                {round.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Round progress & blurry profile frame */}
      <div className="mb-6 border-y border-foreground/20 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="editorial-kicker text-cerebral">
              Kolo {roundIndex + 1} · {currentRound.label}
            </p>
            <p className="mt-1 text-sm text-foreground/75">{currentRound.helper}</p>
          </div>
          <span className="font-display text-lg text-foreground shrink-0 font-bold">
            {roundSecondsLeft}
            <span className="text-sm text-foreground/35"> s</span>
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {/* Heavy blur for profiles initially */}
          <div className="relative size-14 shrink-0 overflow-hidden border border-foreground/20 rounded-none bg-black">
            {match.videoUrls && match.videoUrls.length > 0 ? (
              <video
                src={match.videoUrls[0]}
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-contain bg-black"
                style={{ transform: "scaleX(-1)", filter: `blur(${blurPx}px)` }}
              />
            ) : (
              <img
                src={match.img}
                alt={match.name}
                className="size-full object-cover scale-125"
                style={{ filter: `blur(${blurPx}px)` }}
              />
            )}
            <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5 bg-black/75 px-1 py-0.5 border border-white/5">
              <span className="size-1 animate-pulse rounded-full bg-cerebral" />
              <span className="font-mono text-xs tracking-tighter text-cerebral">LIVE</span>
            </div>
          </div>
          {myVideoUrl && (
            <div className="relative size-14 shrink-0 overflow-hidden border border-foreground/20 rounded-none bg-black">
              <video
                src={myVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-contain bg-black"
                style={{ transform: "scaleX(-1)", filter: `blur(${blurPx}px)` }}
              />
              <span className="absolute bottom-0.5 right-0.5 bg-background/60 px-1 font-mono text-xs tracking-widest text-foreground/70 uppercase">
                TY
              </span>
              <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5 bg-black/75 px-1 py-0.5 border border-white/5">
                <span className="size-1 animate-pulse rounded-full bg-cerebral" />
                <span className="font-mono text-xs tracking-tighter text-cerebral">LIVE</span>
              </div>
            </div>
          )}
          <div className="ml-auto flex h-14 flex-1 items-center gap-1 overflow-hidden">
            {Array.from({ length: 14 }).map((_, index) => {
              const barThreshold = ((index + 1) / 14) * 100;
              const height = 26 + ((index * 29) % 68);
              return (
                <span
                  key={index}
                  className={`flex-1 transition-colors duration-500 ${
                    progressPct >= barThreshold ? "bg-cerebral" : "bg-foreground/10"
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <p className="editorial-kicker text-accent">
          {roundIndex === 0 ? "Otázka pre vás oboch" : `Zadanie pre kolo ${roundIndex + 1}`}
        </p>
        <p className="mt-2 font-display text-2xl font-semibold leading-tight tracking-[-0.04em]">
          {currentRound.prompt}
        </p>
      </div>

      {/* Icebreaker Dilemma Card */}
      {roundIndex === 0 ? (
        <div className="mb-6">
          <IcebreakerDilemma
            similarity={
              1.0 -
              Math.sqrt(
                Math.pow((user.cognitiveDepth ?? 0.5) - match.cognitive_depth, 2) +
                  Math.pow((user.conscientiousness ?? 0.5) - match.conscientiousness, 2),
              ) /
                Math.sqrt(2.0)
            }
            complementarity={Math.max(
              0,
              1.0 -
                Math.min(
                  1.0,
                  Math.max(
                    0.0,
                    (user.extraversion ?? 0.5) + match.extraversion < 1.0
                      ? 0.5 * (1.0 - ((user.extraversion ?? 0.5) + match.extraversion))
                      : 1.0 * ((user.extraversion ?? 0.5) + match.extraversion - 1.0),
                  ),
                ),
            )}
            userStyle={user.attachmentStyle ?? "Secure"}
            matchStyle={match.attachment_style}
            userTopPriority={user.topPriority ?? "rodina"}
            matchTopPriority={match.top_priority}
          />
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-4 border border-foreground/20 bg-foreground/[0.04] p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-mono text-sm font-bold text-accent-foreground">
            {roundIndex + 1}
          </span>
          <div>
            <p className="font-display text-lg font-bold">{currentRound.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/55">
              Po vypočutí hlasovky nahraj jednu sústredenú odpoveď. Nemusíš vyplniť celý čas.
            </p>
          </div>
        </div>
      )}

      <div className="my-6 flex h-16 items-center justify-center gap-1.5 border-y border-foreground/15" aria-hidden="true">
        {Array.from({ length: 21 }).map((_, index) => {
          const distance = Math.abs(10 - index);
          const height = recording ? Math.max(10, liveLevel * (85 - distance * 4)) : 12;
          return (
            <div
              key={index}
              className={`w-1 rounded-full transition-[height] duration-100 ${recording ? "bg-cerebral" : "bg-foreground/20"}`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      {micError && (
        <div className="mb-3 border border-foreground/30 bg-foreground/[0.06] px-4 py-3 text-xs text-foreground">
          {micError}
          <button
            onClick={() => setMicError(null)}
            className="ml-2 underline opacity-70 hover:opacity-100"
          >
            zavrieť
          </button>
        </div>
      )}

      {!supabaseMatchId && (
        <div role="status" className="mb-3 border border-foreground/25 px-4 py-3 text-sm text-foreground/80">
          {connectionError ? "Nepodarilo sa pripojiť rozhovor." : "Pripájame rozhovor…"}
          {connectionError && <button type="button" className="ml-2 underline" onClick={() => {
            setConnectionError(false);
            setConnectionAttempt((attempt) => attempt + 1);
          }}>Skúsiť znova</button>}
        </div>
      )}

      {/* Voice Messages Bubbles */}
      <div className="space-y-3 py-2">
        {messages.map((m) => (
          <VoiceBubble
            key={m.id}
            msg={m}
            playing={playing === m.id}
            onToggle={() => {
              haptic("tap");
              setPlaying(playing === m.id ? null : m.id);
            }}
            onEnded={() => setPlaying(null)}
          />
        ))}
      </div>

      {stage === "voice" && (
        <>
          <div className="h-56" aria-hidden />
          <RecordButton
            recording={recording}
            recLen={recLen}
            liveLevel={liveLevel}
            draft={
              draftVoice
                ? {
                    url: draftVoice.url,
                    duration: draftVoice.duration,
                    peaks: draftVoice.peaks,
                  }
                : null
            }
            disabled={!supabaseMatchId || sending}
            sending={sending}
            onStart={startRec}
            onCommit={() => stopRec(true)}
            onCancel={() => stopRec(false)}
            onSendDraft={sendDraftVoice}
            onDiscardDraft={discardDraftVoice}
          />
        </>
      )}

      {stage === "blindVote" && (
        <BlindVote
          matchName={match.name}
          onVote={async (vote) => {
            haptic(vote === "unlock" ? "success" : "warning");
            setMyChoice(vote);
            setStage("waiting");
            onFairInteraction();

            if (!supabaseMatchId) {
              // Fallback to simulation if supabase is not available (demo mode)
              setTimeout(() => {
                const partnerCooperates = Math.random() < (match.score > 70 ? 0.9 : 0.6);
                const partnerChoice = partnerCooperates ? "unlock" : "cancel";
                setTheirChoice(partnerChoice);

                if (vote === "unlock" && partnerChoice === "unlock") {
                  haptic("success");
                  setStage("result-yes");
                } else {
                  haptic("warning");
                  setStage("result-no");
                }
              }, 2500);
              return;
            }

            try {
              // Submit our vote to Supabase
              await submitBlindVote(supabaseMatchId, user.id!, vote);

              // Check if the other user has already voted
              const { data: partnerVotes } = await supabase
                .from("blind_votes")
                .select("vote")
                .eq("match_id", supabaseMatchId)
                .neq("user_id", user.id!)
                .maybeSingle();

              if (partnerVotes) {
                setTheirChoice(partnerVotes.vote as "unlock" | "cancel");

                if (partnerVotes.vote === "cancel" || vote === "cancel") {
                  await supabase
                    .from("matches")
                    .update({ status: "deleted" })
                    .eq("id", supabaseMatchId);
                  haptic("warning");
                  setStage("result-no");
                  return;
                }
              }

              // Subscribe to match updates (is_unlocked changes)
              const matchChannel = supabase
                .channel(`match_status:${supabaseMatchId}`)
                .on(
                  "postgres_changes",
                  {
                    event: "UPDATE",
                    schema: "public",
                    table: "matches",
                    filter: `id=eq.${supabaseMatchId}`,
                  },
                  (payload) => {
                    const updatedMatch = payload.new;
                    if (updatedMatch.status === "deleted") {
                      haptic("warning");
                      setStage("result-no");
                    } else if (updatedMatch.is_unlocked) {
                      haptic("success");
                      setStage("result-yes");
                    }
                  },
                )
                .subscribe();
              void matchChannel;

              // Also check immediately if already unlocked by Postgres trigger
              const { data: currentMatch } = await supabase
                .from("matches")
                .select("is_unlocked, status")
                .eq("id", supabaseMatchId)
                .single();

              if (currentMatch) {
                if (currentMatch.status === "deleted") {
                  haptic("warning");
                  setStage("result-no");
                } else if (currentMatch.is_unlocked) {
                  haptic("success");
                  setStage("result-yes");
                }
              }
            } catch (err) {
              console.error("[Chamber] Vote submission failed:", err);
              alert("Odoslanie voľby zlyhalo. Skúste znova.");
              setStage("blindVote");
            }
          }}
        />
      )}

      {stage === "waiting" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-md">
          <div className="night-radio w-full max-w-md border-2 border-foreground p-8 animate-fade-up">
            <p className="editorial-kicker text-accent">Slepá voľba odoslaná</p>
            <h3 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.05em]">
              Čakáme na {match.name}
            </h3>
            <div className="my-6 flex h-12 items-end gap-1.5" aria-hidden>
              {[35, 62, 48, 80, 52, 70, 40, 88, 56, 44].map((h, idx) => (
                <span
                  key={idx}
                  className="flex-1 animate-pulse bg-cerebral"
                  style={{ height: `${h}%`, animationDelay: `${idx * 90}ms` }}
                />
              ))}
            </div>
            <p className="text-sm text-foreground/65">
              Tvoja voľba:{" "}
              <span className="font-semibold text-foreground">
                {myChoice === "unlock" ? "Chcem pokračovať" : "Ukončiť rozhovor"}
              </span>
            </p>
          </div>
        </div>
      )}

      {stage === "result-yes" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-md">
          <div className="night-radio w-full max-w-md border-2 border-foreground p-6 sm:p-7 animate-fade-up shadow-[6px_6px_0_rgba(244,239,229,0.9)]">
            <p className="editorial-kicker text-cerebral">Obojstranná zhoda</p>
            <h3 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-0.05em]">
              Obaja chcete pokračovať.
            </h3>
            <p className="mt-2 text-sm text-foreground/65">
              Obraz sa vyostruje a otvára sa váš spoločný priestor bez časového limitu.
            </p>

            <div className="my-6 flex items-center gap-4 border-y border-foreground/20 py-5">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-foreground bg-black">
                {match.videoUrls && match.videoUrls.length > 0 ? (
                  <video
                    src={match.videoUrls[0]}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="size-full object-cover"
                    style={{
                      transform: "scaleX(-1)",
                      filter: unblurred ? "blur(0px)" : "blur(16px)",
                      transition: "filter 950ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                ) : (
                  <img
                    src={match.img}
                    alt={match.name}
                    className="size-full object-cover"
                    style={{
                      filter: unblurred ? "blur(0px)" : "blur(16px)",
                      transform: unblurred ? "scale(1)" : "scale(1.12)",
                      transition:
                        "filter 950ms cubic-bezier(0.16, 1, 0.3, 1), transform 950ms ease",
                    }}
                  />
                )}
              </div>
              <div>
                <p className="font-display text-2xl font-bold tracking-[-0.04em]">
                  {match.name}
                  <span className="ml-2 text-base font-normal text-foreground/50">{match.age}</span>
                </p>
                <p className="mt-1 text-xs text-foreground/60">{match.city}</p>
              </div>
            </div>

            {match.bio && (
              <blockquote className="mb-6 border-l-2 border-cerebral pl-4 text-sm leading-relaxed text-foreground/80">
                {match.bio}
              </blockquote>
            )}

            <button
              type="button"
              onClick={() => {
                haptic("success");
                onSuccess(0);
              }}
              className="tactile-button flex w-full items-center justify-between bg-cerebral px-5 py-4 text-background cursor-pointer"
            >
              <span className="font-display text-base font-bold">Otvoriť spoločný rozhovor</span>
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>
      )}

      {stage === "result-no" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-md">
          <div className="night-radio w-full max-w-md border-2 border-foreground p-7 animate-fade-up">
            <div className="mb-4 inline-grid size-10 place-items-center rounded-full border border-foreground/30">
              <X className="size-5 text-foreground" />
            </div>
            <h3 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
              Rozhovor sa tu končí
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">
              {myChoice === "cancel"
                ? "Rozhodol/a si sa nepokračovať. Spojenie sme pokojne uzavreli."
                : `${match.name} sa tentoraz rozhodol/a nepokračovať.`}
            </p>
            <p className="mt-2 text-xs text-foreground/45">
              Niekedy stačia tri minúty na to, aby ste mali obaja jasno — bez ghostingu.
            </p>
            <button
              type="button"
              onClick={onDiscard}
              className="tactile-button mt-7 w-full bg-foreground px-5 py-4 font-display text-sm font-bold text-background cursor-pointer"
            >
              Vrátiť sa k dnešným spojeniam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
