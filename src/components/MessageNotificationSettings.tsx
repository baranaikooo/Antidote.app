import { useState } from "react";
import { readMessageAlertSettings, saveMessageAlertSettings } from "@/lib/message-notifications";

export default function MessageNotificationSettings({ userId }: { userId: string }) {
  const [settings, setSettings] = useState(() => readMessageAlertSettings(userId));
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  return (
    <section className="personal-section settings-feature" aria-labelledby="message-alerts-title">
      <h2 id="message-alerts-title" className="personal-heading">
        Upozornenia na správy
      </h2>
      <p className="summary-detail">
        Upozornenie sa zobrazí, keď máš Antidote otvorené. Správy nájdeš v schránke aj počas tichých
        hodín.
      </p>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            saveMessageAlertSettings(userId, settings);
            setNotice({ text: "Nastavenia upozornení sú uložené na tomto zariadení." });
          } catch (error) {
            setNotice({
              error: true,
              text:
                error instanceof RangeError
                  ? "Zadaj dva rôzne časy."
                  : "Nastavenia sa nepodarilo uložiť.",
            });
          }
        }}
      >
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
          />
          Zobrazovať upozornenia v aplikácii
        </label>
        {settings.enabled && (
          <>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={settings.quiet}
                onChange={(event) => setSettings({ ...settings, quiet: event.target.checked })}
              />
              Tiché hodiny
            </label>
            {settings.quiet && (
              <div className="flex flex-wrap gap-3">
                <label className="grid gap-1">
                  Od{" "}
                  <input
                    aria-label="Začiatok tichých hodín"
                    type="time"
                    required
                    value={settings.start}
                    onChange={(event) => setSettings({ ...settings, start: event.target.value })}
                    className="min-h-11 rounded-lg border border-foreground/35 bg-card px-3"
                  />
                </label>
                <label className="grid gap-1">
                  Do{" "}
                  <input
                    aria-label="Koniec tichých hodín"
                    type="time"
                    required
                    value={settings.end}
                    onChange={(event) => setSettings({ ...settings, end: event.target.value })}
                    className="min-h-11 rounded-lg border border-foreground/35 bg-card px-3"
                  />
                </label>
              </div>
            )}
          </>
        )}
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={notice.error ? "text-destructive" : "text-muted-foreground"}
          >
            {notice.text}
          </p>
        )}
        <button type="submit" className="personal-action justify-self-start">
          Uložiť upozornenia
        </button>
      </form>
    </section>
  );
}
