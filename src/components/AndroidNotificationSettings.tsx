import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  defaultAndroidAlertOptions,
  readAndroidAlertOptions,
  saveAndroidAlertOptions,
  type AndroidAlertOptions,
} from "@/lib/android-voice-alerts";

export function AndroidNotificationSettings({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<AndroidAlertOptions | null>(null);
  const [options, setOptions] = useState(defaultAndroidAlertOptions);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    readAndroidAlertOptions()
      .then((current) => {
        if (!active || !current) return;
        setSaved(current);
        setOptions(current);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [userId, loadAttempt]);

  if (loadFailed) {
    return (
      <p role="status" className="mt-4 text-sm">
        Nastavenia Android upozornení sa nepodarilo načítať.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setLoadFailed(false);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Skúsiť znova
        </button>
      </p>
    );
  }
  if (!saved) return null;
  const changed =
    options.voice_replies !== saved.voice_replies ||
    options.chat_messages !== saved.chat_messages ||
    options.show_sender !== saved.show_sender;

  function changeOption(key: keyof AndroidAlertOptions, checked: boolean) {
    setOptions((current) => {
      const next = { ...current, [key]: checked };
      if (!next.voice_replies && !next.chat_messages) next.show_sender = false;
      return next;
    });
    setNotice(undefined);
  }

  async function save() {
    if (!saved || saving) return;
    setSaving(true);
    setNotice(undefined);
    try {
      if (await saveAndroidAlertOptions(userId, options, saved)) {
        setSaved(options);
        setNotice({ text: "Upozornenia Androidu sú uložené." });
      } else {
        setNotice({ error: true, text: "Povoľ upozornenia pre Antidote v nastaveniach Androidu." });
      }
    } catch {
      setNotice({ error: true, text: "Nastavenia sa nepodarilo uložiť. Skús to znova." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mt-4 grid gap-3 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className="font-semibold">Upozornenia Androidu</h3>
      <label className="settings-switch-row">
        <span>Nové správy</span>
        <Switch
          disabled={saving}
          checked={options.chat_messages}
          onCheckedChange={(value) => changeOption("chat_messages", value)}
        />
      </label>
      <label className="settings-switch-row">
        <span>Odpovede na spoločnú otázku</span>
        <Switch
          disabled={saving}
          checked={options.voice_replies}
          onCheckedChange={(value) => changeOption("voice_replies", value)}
        />
      </label>
      <label className="settings-switch-row">
        <span>Zobraziť meno odosielateľa</span>
        <Switch
          disabled={saving || (!options.chat_messages && !options.voice_replies)}
          checked={options.show_sender}
          onCheckedChange={(value) => changeOption("show_sender", value)}
        />
      </label>
      <p className="summary-detail">
        Po zapnutí môže Android zobraziť meno aj na zamknutej obrazovke.
      </p>
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={notice.error ? "text-destructive" : "text-muted-foreground"}
        >
          {notice.text}
        </p>
      )}
      <button
        type="submit"
        className="personal-action justify-self-start"
        disabled={!changed || saving}
      >
        {saving ? "Ukladám…" : "Uložiť upozornenia Androidu"}
      </button>
    </form>
  );
}
