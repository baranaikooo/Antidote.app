import { useState } from "react";
import { AndroidNotificationSettings } from "@/components/AndroidNotificationSettings";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { Switch } from "@/components/ui/switch";
import { readMessageAlertSettings, saveMessageAlertSettings } from "@/lib/message-notifications";
import { hasAndroidPush } from "@/lib/android-voice-alerts";

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
        <label className="settings-switch-row">
          <span>Zobrazovať upozornenia v aplikácii</span>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => setSettings({ ...settings, enabled })}
          />
        </label>
        {settings.enabled && (
          <>
            <label className="settings-switch-row">
              <span>Tiché hodiny</span>
              <Switch
                checked={settings.quiet}
                onCheckedChange={(quiet) => setSettings({ ...settings, quiet })}
              />
            </label>
            {settings.quiet && (
              <div className="grid gap-3 sm:grid-cols-2">
                <QuietTimeFields
                  label="Od"
                  time={settings.start}
                  onChange={(start) => setSettings({ ...settings, start })}
                />
                <QuietTimeFields
                  label="Do"
                  time={settings.end}
                  onChange={(end) => setSettings({ ...settings, end })}
                />
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
      {hasAndroidPush() && <AndroidNotificationSettings userId={userId} />}
    </section>
  );
}

function timeChoices(count: number) {
  return Array.from({ length: count }, (_, number) => {
    const value = String(number).padStart(2, "0");
    return { value, label: value };
  });
}

const hourChoices = timeChoices(24);
const minuteChoices = timeChoices(60);

function QuietTimeFields({
  label,
  time,
  onChange,
}: {
  label: string;
  time: string;
  onChange: (time: string) => void;
}) {
  const [hours, minutes] = time.split(":");
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 font-semibold">{label}</legend>
      <div className="quiet-time-fields">
        <ChoiceSelect
          label={`${label} – hodina`}
          value={hours}
          options={hourChoices}
          onValueChange={(value) => onChange(`${value}:${minutes}`)}
        />
        <span aria-hidden="true">:</span>
        <ChoiceSelect
          label={`${label} – minúta`}
          value={minutes}
          options={minuteChoices}
          onValueChange={(value) => onChange(`${hours}:${value}`)}
        />
      </div>
    </fieldset>
  );
}
