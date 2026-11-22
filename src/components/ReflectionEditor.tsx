import { useState, type FormEvent } from "react";
import { REFLECTION_MAX_LENGTH, REFLECTION_QUESTION } from "@/lib/conversations";

export function ReflectionEditor({
  initialValue = "",
  onSave,
  onSkip,
}: {
  initialValue?: string | null;
  onSave: (value: string | null) => Promise<void>;
  onSkip?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [published, setPublished] = useState(Boolean(initialValue));

  async function submit(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
      setMessage(success);
    } catch {
      setFailed(true);
      setMessage("Zmenu sa nepodarilo uložiť. Skús to znova.");
    } finally {
      setBusy(false);
    }
  }

  function share(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    void submit(async () => {
      await onSave(value);
      setPublished(true);
    }, "Odpoveď je zdieľaná.");
  }

  return (
    <form className="onboarding-panel space-y-4" onSubmit={share}>
      <div>
        <h2 className="personal-heading">Hodnota, ktorú si si vybral/a</h2>
        <p className="mt-2 text-muted-foreground">
          Zdieľanú odpoveď môžu vidieť prihlásení ľudia v Antidote. Stiahnuť ju môžeš vo svojom
          profile. Už odoslané reakcie si odpoveď ponechajú.
        </p>
      </div>
      <label className="block font-semibold" htmlFor="antidote-reflection">
        {REFLECTION_QUESTION}
      </label>
      <textarea
        id="antidote-reflection"
        rows={4}
        maxLength={REFLECTION_MAX_LENGTH}
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        className="w-full resize-y rounded-lg border border-foreground/35 bg-background px-3 py-2.5 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "text-destructive" : "text-muted-foreground"}
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !draft.trim()} className="match-card-action">
          {busy ? "Ukladám…" : onSkip ? "Zdieľať a pokračovať" : "Zdieľať odpoveď"}
        </button>
        {onSkip && (
          <button
            type="button"
            disabled={busy}
            className="personal-action"
            onClick={() => void submit(onSkip, "")}
          >
            Preskočiť
          </button>
        )}
        {!onSkip && published && (
          <button
            type="button"
            disabled={busy}
            className="personal-action"
            onClick={() =>
              void submit(async () => {
                await onSave(null);
                setDraft("");
                setPublished(false);
              }, "Odpoveď už nie je zdieľaná.")
            }
          >
            Stiahnuť odpoveď
          </button>
        )}
      </div>
    </form>
  );
}
