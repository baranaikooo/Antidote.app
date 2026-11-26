import { useEffect, useState } from "react";
import {
  hasConversationPilotResponse,
  submitConversationPilotResponse,
} from "@/lib/conversation-inbox";

export function ConversationFeedback({ matchId, userId }: { matchId: string; userId: string }) {
  const key = "reson:pilot-feedback-skipped:" + userId + ":" + matchId;
  const [state, setState] = useState<"checking" | "ready" | "done">("checking");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      if (localStorage.getItem(key)) {
        setState("done");
        return;
      }
    } catch {
      // The question remains optional if browser storage is unavailable.
    }
    void hasConversationPilotResponse(matchId)
      .then((saved) => {
        if (active) setState(saved ? "done" : "ready");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key, matchId]);

  async function answer(wouldContinue: boolean) {
    setSubmitting(true);
    setFailed(false);
    try {
      await submitConversationPilotResponse(matchId, wouldContinue);
      setState("done");
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (state !== "ready") return null;
  return (
    <section className="editorial-panel p-4" aria-labelledby="pilot-question">
      <h2 id="pilot-question" className="font-semibold">
        Chcel/a by si v tomto rozhovore pokračovať?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Odpoveď je dobrovoľná. Druhá osoba ju neuvidí.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="personal-action"
          disabled={submitting}
          onClick={() => void answer(true)}
        >
          Áno
        </button>
        <button
          type="button"
          className="personal-action"
          disabled={submitting}
          onClick={() => void answer(false)}
        >
          Nie
        </button>
        <button
          type="button"
          className="personal-action"
          disabled={submitting}
          onClick={() => {
            try {
              localStorage.setItem(key, "1");
            } catch {
              /* Skip for this visit. */
            }
            setState("done");
          }}
        >
          Preskočiť
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Odpoveď sa nepodarilo uložiť. Skús to znova.
        </p>
      )}
    </section>
  );
}
