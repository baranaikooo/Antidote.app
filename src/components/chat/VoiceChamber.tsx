import { useState, useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useHaptic } from "@/hooks/use-haptics";
import { RecordButton } from "./RecordButton";
import { pickAudioMime, createMediaRecorder, stopStream } from "@/lib/media";
import { uploadVoiceMessageBlob } from "@/lib/supabase";

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
  userId,
  matchId,
  name,
  prompt,
  onBack,
}: {
  userId: string;
  matchId: string;
  name: string;
  prompt: string;
  onBack: () => void;
}) {
  const haptic = useHaptic();
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

  // Cleanup mic + object URLs on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickMime(): string {
    return pickAudioMime();
  }

  async function startRec() {
    if (recording || sendingRef.current) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const msg = "Tento prehliadač nepodporuje nahrávanie z mikrofónu.";
      console.warn("[voice]", msg);
      setMicError(msg);
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      const msg = "V tomto prehliadači sa nedá nahrať hlasová správa.";
      console.warn("[voice]", msg);
      setMicError(msg);
      return;
    }

    pendingStopRef.current = null;
    cancelledRef.current = false;
    peakSamplesRef.current = [];
    setMicError(null);
    setRecLen(0);
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
            setMicError("V nahrávke nie je zvuk. Skús ju nahrať znova.");
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
    if (!draftVoice || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMicError(null);
    const { id, blob, duration } = draftVoice;
    try {
      await uploadVoiceMessageBlob(matchId, userId, blob, duration, id);
      haptic("send");
      onBack();
    } catch (err) {
      console.error("[Chamber] Failed to upload voice message:", err);
      setMicError("Správu sa nepodarilo odoslať. Nahrávka zostala pripravená, skús to znova.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <section className="voice-screen night-radio mx-auto min-h-[100dvh] max-w-md px-4 py-4">
      <header className="mb-5 flex items-center gap-3 border-b border-foreground/25 pb-3">
        <button
          type="button"
          aria-label="Späť na rozhovor"
          className="conversation-header-action"
          onClick={onBack}
          disabled={sending}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Hlasová správa</h1>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
      </header>
      <div className="editorial-panel p-4">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{prompt}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nahrávku si môžeš vypočuť pred odoslaním.
        </p>
      </div>
      {micError && (
        <p role="alert" className="mt-4 text-sm">
          {micError}
        </p>
      )}
      <RecordButton
        recording={recording}
        recLen={recLen}
        liveLevel={liveLevel}
        draft={
          draftVoice
            ? { url: draftVoice.url, duration: draftVoice.duration, peaks: draftVoice.peaks }
            : null
        }
        disabled={sending}
        sending={sending}
        onStart={startRec}
        onCommit={() => stopRec(true)}
        onCancel={() => stopRec(false)}
        onSendDraft={sendDraftVoice}
        onDiscardDraft={discardDraftVoice}
      />
    </section>
  );
}
