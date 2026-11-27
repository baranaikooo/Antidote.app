import { useEffect, useRef, useState } from "react";
import { Mic, Reply } from "lucide-react";
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

function QuestionVoicePlayer({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
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

  return (
    <div className="min-w-0 rounded-lg bg-muted p-3">
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
          <audio
            className="w-full"
            aria-label={label}
            controls
            preload="none"
            src={url}
            onError={() => setFailed(true)}
          />
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
