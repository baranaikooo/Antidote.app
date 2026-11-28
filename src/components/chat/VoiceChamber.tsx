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
  onAnswer,
}: {
  userId: string;
  matchId: string;
  name: string;
  prompt: string;
  onBack: () => void;
  onAnswer?: (blob: Blob, draftId: string) => Promise<void>;
}) {
  const haptic = useHaptic();
  const maxSeconds = onAnswer ? 20 : MAX_REC_SECONDS;
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [finishing, setFinishing] = useState(false);
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
  const captureLock = useRef(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const peakSamplesRef = useRef<number[]>([]);
  const draftUrlRef = useRef<string | null>(null);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

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
      if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
      try {
        const rec = mediaRecRef.current;
        if (rec) {
          rec.onstop = null;
          rec.onerror = null;
          if (rec.state !== "inactive") rec.stop();
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
    if (captureLock.current || sendingRef.current) return;
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

    captureLock.current = true;
    setPreparing(true);
    cancelledRef.current = false;
    peakSamplesRef.current = [];
    setMicError(null);
    setRecLen(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (cancelledRef.current) {
        stopStream(stream);
        return;
      }
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

      rec.onerror = () => {
        cancelledRef.current = true;
        setMicError("Nahrávanie sa prerušilo. Skús to znova.");
      };
      rec.onstop = () => {
        stopAudioMeter();
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        if (micStreamRef.current) stopStream(micStreamRef.current);
        micStreamRef.current = null;
        mediaRecRef.current = null;
        captureLock.current = false;
        setFinishing(false);
        setRecording(false);

        if (cancelledRef.current) return;

        const elapsed = (performance.now() - recStartRef.current) / 1000;
        if (elapsed < 1.0) {
          setMicError("Hlasovka je príliš krátka.");
          return;
        }

        const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || mime }) : null;
        if (!blob || blob.size === 0) {
          setMicError("V nahrávke nie je zvuk. Skús ju nahrať znova.");
          return;
        }

        const dur = Math.min(maxSeconds, Math.round(elapsed));
        const url = URL.createObjectURL(blob);
        const peaks = normalizePeaks(peakSamplesRef.current);

        if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
        draftUrlRef.current = url;
        setDraftVoice({ id: crypto.randomUUID(), blob, url, duration: dur, peaks });
      };

      rec.start(100);
      recStartRef.current = performance.now();
      setRecording(true);

      tickRef.current = setInterval(() => {
        const sec = (performance.now() - recStartRef.current) / 1000;
        setRecLen(sec);
        if (sec >= maxSeconds) stopRec(true);
      }, 250);
    } catch (err) {
      stopAudioMeter();
      if (micStreamRef.current) stopStream(micStreamRef.current);
      micStreamRef.current = null;
      mediaRecRef.current = null;
      captureLock.current = false;
      if (cancelledRef.current) return;
      console.error("[voice] start recording failed:", err);
      const e = err as Error;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicError(
          "Prístup k mikrofónu bol zamietnutý. Povoľ mikrofón v nastaveniach aplikácie alebo prehliadača.",
        );
      } else {
        setMicError(`Nepodarilo sa spustiť mikrofón: ${e.message}`);
      }
      setRecording(false);
    } finally {
      if (!cancelledRef.current) setPreparing(false);
    }
  }

  function stopRec(commit: boolean) {
    const rec = mediaRecRef.current;
    if (!rec || rec.state === "inactive") return;
    cancelledRef.current = !commit;
    setRecording(false);
    setFinishing(true);
    stopAudioMeter();
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    try {
      rec.stop();
    } catch (err) {
      console.warn("[voice] stop error:", err);
      if (micStreamRef.current) stopStream(micStreamRef.current);
      micStreamRef.current = null;
      mediaRecRef.current = null;
      captureLock.current = false;
      setFinishing(false);
      setMicError("Nahrávanie sa prerušilo. Skús to znova.");
    }
  }

  function discardDraftVoice() {
    if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
    draftUrlRef.current = null;
    setDraftVoice(null);
  }

  async function sendDraftVoice() {
    if (!draftVoice || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMicError(null);
    const { id, blob, duration } = draftVoice;
    try {
      if (onAnswer) await onAnswer(blob, id);
      else await uploadVoiceMessageBlob(matchId, userId, blob, duration, id);
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
    <section
      className="conversation-screen"
      aria-label={onAnswer ? "Hlasová odpoveď" : "Hlasová správa"}
    >
      <header className="conversation-header flex shrink-0 items-center gap-3 px-3 py-3">
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
          <h1 className="text-xl font-bold">{onAnswer ? "Hlasová odpoveď" : "Hlasová správa"}</h1>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="rounded-2xl bg-card p-4">
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{prompt}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {onAnswer
              ? "Máš najviac 20 sekúnd. Odpovede si vypočujete, keď odpoviete obaja."
              : "Nahrávku si môžeš vypočuť pred odoslaním."}
          </p>
        </div>
        {micError && (
          <p role="alert" className="mt-4 text-sm">
            {micError}
          </p>
        )}
        {preparing && (
          <p role="status" className="mt-4 text-sm">
            Čakám na mikrofón…
          </p>
        )}
      </div>
      <RecordButton
        recording={recording}
        recLen={recLen}
        liveLevel={liveLevel}
        draft={
          draftVoice
            ? { url: draftVoice.url, duration: draftVoice.duration, peaks: draftVoice.peaks }
            : null
        }
        disabled={sending || preparing || finishing}
        maxSeconds={maxSeconds}
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
