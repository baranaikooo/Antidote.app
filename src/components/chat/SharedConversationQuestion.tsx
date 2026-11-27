import { useEffect, useRef, useState } from "react";
import { Reply } from "lucide-react";
import { respondToSharedQuestion, type SharedQuestion } from "@/lib/shared-question";

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
