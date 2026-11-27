import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Reply } from "lucide-react";
import {
  respondToSharedQuestion,
  signQuestionVoice,
  withdrawQuestionVoice,
  type SharedQuestion,
} from "@/lib/shared-question";

export function SharedVoiceQuestion({
  matchId,
  name,
  question,
  onRecord,
  onChange,
}: {
  matchId: string;
  name: string;
  question: SharedQuestion;
  onRecord: () => void;
  onChange: (question: SharedQuestion) => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState(false);
  const own = question.own_voice_path;
  const partner = question.partner_voice_path;

  async function withdraw() {
    if (!own || withdrawing) return;
    setWithdrawing(true);
    setError(false);
    try {
      onChange(await withdrawQuestionVoice(matchId, own));
    } catch {
      setError(true);
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <section className="conversation-intro" aria-labelledby="shared-question-heading">
      <h2 id="shared-question-heading" className="font-semibold">
        Spoločná otázka
      </h2>
      <p className="mt-2 font-medium">{question.question}</p>
      {own ? (
        <>
          <dl className="mt-3 grid gap-2">
            <QuestionVoicePlayer key={own} label="Tvoja odpoveď" path={own} />
            {partner && <QuestionVoicePlayer key={partner} label={name} path={partner} />}
          </dl>
          {!partner && (
            <>
              <p role="status" className="mt-3 text-sm text-muted-foreground">
                Odpoveď je uložená. Chat sa otvorí, keď odpovie aj druhý človek.
              </p>
              <button
                type="button"
                className="personal-action mt-3"
                disabled={withdrawing}
                onClick={() => void withdraw()}
              >
                Stiahnuť odpoveď
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Odpovede si vypočujete, keď odpoviete obaja.
          </p>
          <button type="button" className="personal-action mt-3" onClick={onRecord}>
            <Mic className="size-4" aria-hidden="true" />
            Nahrať odpoveď
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Odpoveď sa nepodarilo stiahnuť. Skús to znova.
        </p>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const safe = Math.round(seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function QuestionVoicePlayer({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    signQuestionVoice(path)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path, attempt]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (audio.ended) audio.currentTime = 0;
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <dt className="break-words text-sm font-semibold">{label}</dt>
      <dd className="mt-2">
        {failed ? (
          <button
            type="button"
            className="personal-action"
            onClick={() => {
              setFailed(false);
              setUrl(undefined);
              setAttempt((previous) => previous + 1);
            }}
          >
            Načítať nahrávku znova
          </button>
        ) : url ? (
          <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-card px-3 py-2">
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={playing ? `Pozastaviť odpoveď: ${label}` : `Prehrať odpoveď: ${label}`}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-transform active:scale-95 cursor-pointer"
            >
              {playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4 translate-x-[1px]" aria-hidden="true" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
            </span>
            <audio
              ref={audioRef}
              aria-label={label}
              preload="none"
              playsInline
              src={url}
              onLoadedMetadata={(event) => {
                const dur = event.currentTarget.duration;
                if (Number.isFinite(dur)) setDuration(dur);
              }}
              onTimeUpdate={(event) => {
                setCurrentTime(event.currentTarget.currentTime);
              }}
              onEnded={() => {
                setPlaying(false);
                setCurrentTime(0);
              }}
              onError={() => {
                setPlaying(false);
                setFailed(true);
              }}
            />
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Načítavam nahrávku…
          </p>
        )}
      </dd>
    </div>
  );
}

export function SharedConversationQuestion({
  matchId,
  name,
  question,
  selected,
  sending,
  onChange,
  onReply,
}: {
  matchId: string;
  name: string;
  question: SharedQuestion;
  selected: boolean;
  sending: boolean;
  onChange: (question: SharedQuestion) => void;
  onReply: (answer: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (editing) answerField.current?.focus();
  }, [editing]);

  async function respond(value: string | null) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(false);
    try {
      const updated = await respondToSharedQuestion(matchId, value);
      setAnswer("");
      setEditing(false);
      onChange(updated);
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  if (question.skipped) return null;
  const partnerAnswer = question.partner_answer;
  const showEditor = question.required || editing;
  return (
    <section className="conversation-intro" aria-labelledby="shared-question-heading">
      <h2 id="shared-question-heading" className="font-semibold">
        Spoločná otázka
      </h2>
      <p className="mt-2 font-medium">{question.question}</p>
      {question.own_answer ? (
        <>
          <dl className={partnerAnswer ? "mt-3 grid grid-cols-2 gap-2" : "mt-3"}>
            <div className="min-w-0 rounded-lg bg-muted p-3">
              <dt className="text-sm font-semibold">Ty</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {question.own_answer}
              </dd>
            </div>
            {partnerAnswer && (
              <div className="min-w-0 rounded-lg bg-muted p-3">
                <dt className="break-words text-sm font-semibold">{name}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{partnerAnswer}</dd>
              </div>
            )}
          </dl>
          {partnerAnswer && !question.required && (
            <button
              type="button"
              className="personal-action conversation-follow-up"
              aria-pressed={selected}
              disabled={sending}
              onClick={() => onReply(partnerAnswer)}
            >
              <Reply className="size-4" aria-hidden="true" />
              Nadviazať na odpoveď
            </button>
          )}
          {!partnerAnswer && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {question.required
                ? "Odpoveď je uložená. Chat sa otvorí, keď odpovie aj druhý človek."
                : "Odpoveď je uložená. Obaja ich uvidíte, keď odpovie aj druhý človek."}
            </p>
          )}
        </>
      ) : (
        <p id="shared-question-privacy" className="mt-2 text-sm text-muted-foreground">
          {question.required
            ? "Keď odpoviete obaja, uvidíte svoje odpovede a otvorí sa chat."
            : "Odpovede sa zobrazia, keď odpoviete obaja."}
        </p>
      )}
      {!partnerAnswer && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (showEditor && answer.trim()) void respond(answer.trim());
          }}
        >
          {showEditor && !question.own_answer && (
            <label className="mt-3 grid gap-1 text-sm font-semibold">
              Tvoja odpoveď
              <textarea
                ref={answerField}
                className="conversation-input w-full font-normal"
                value={answer}
                rows={2}
                maxLength={400}
                aria-describedby="shared-question-privacy"
                disabled={saving}
                onChange={(event) => setAnswer(event.target.value)}
              />
            </label>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!question.own_answer &&
              (showEditor ? (
                <button
                  type="submit"
                  className="personal-action"
                  disabled={saving || !answer.trim()}
                >
                  Odoslať odpoveď
                </button>
              ) : (
                <button
                  type="button"
                  className="personal-action"
                  disabled={saving}
                  onClick={() => setEditing(true)}
                >
                  Odpovedať
                </button>
              ))}
            {(!question.required || question.own_answer) && (
              <button
                type="button"
                className="personal-action"
                disabled={saving}
                onClick={() => void respond(null)}
              >
                {question.own_answer ? "Stiahnuť odpoveď" : "Preskočiť"}
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Zmenu sa nepodarilo uložiť. Skús to znova.
        </p>
      )}
    </section>
  );
}
