import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import {
  androidUpdatePlatform,
  downloadAndroidUpdater,
  installedAndroidVersion,
  installAndroidUpdate,
  latestAndroidVersion,
  type AndroidVersion,
} from "@/lib/android-updates";

function useAndroidRelease(automatic: boolean) {
  const [platform, setPlatform] = useState<ReturnType<typeof androidUpdatePlatform>>(null);
  const [installed, setInstalled] = useState<AndroidVersion | null>(null);
  const [available, setAvailable] = useState<AndroidVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const platform = androidUpdatePlatform();
    setPlatform(platform);
    if (platform !== "native") return;
    let active = true;

    async function loadInstalled() {
      const version = await installedAndroidVersion();
      if (active) setInstalled(version);
    }

    void loadInstalled().catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!automatic || !installed) return;
    let active = true;
    function check() {
      if (document.visibilityState !== "visible") return;
      void latestAndroidVersion().then((version) => {
        if (active) setAvailable(version && version.code > installed.code ? version : null);
      }).catch(() => {});
    }
    check();
    const interval = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [automatic, installed]);

  async function checkNow() {
    setBusy(true);
    setMessage("Kontrolujem aktualizácie…");
    try {
      const current = installed ?? await installedAndroidVersion();
      const version = await latestAndroidVersion();
      const newer = version && version.code > current.code ? version : null;
      setInstalled(current);
      setAvailable(newer);
      setMessage(newer ? "" : "Máš najnovšiu verziu.");
    } catch {
      setMessage("Aktualizácie sa nepodarilo skontrolovať. Skús to znova.");
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    if (busy || (!available && platform !== "legacy")) return;
    setBusy(true);
    setMessage("Sťahujem aktualizáciu…");
    try {
      if (platform === "legacy") {
        await downloadAndroidUpdater();
        setMessage("Po stiahnutí otvor APK a potvrď aktualizáciu. Ďalšie verzie nainštaluješ priamo tu.");
      } else if (available) {
        const { state } = await installAndroidUpdate(available);
        setMessage(state === "permission"
          ? "Povoľ inštaláciu z Antidote, potom sa vráť a ťukni na Aktualizovať znova."
          : "Potvrď aktualizáciu v okne Androidu.");
      }
    } catch {
      setMessage("Aktualizáciu sa nepodarilo pripraviť. Skús to znova.");
    } finally {
      setBusy(false);
    }
  }

  return { platform, installed, available, busy, message, checkNow, install };
}

export function AndroidUpdateSettings() {
  const update = useAndroidRelease(false);
  if (!update.platform) return null;
  return (
    <section className="personal-section settings-disclosure" aria-labelledby="android-updates-heading">
      <h2 className="personal-heading mb-2" id="android-updates-heading">Aktualizácie aplikácie</h2>
      {update.installed && <p className="personal-intro">Nainštalovaná verzia {update.installed.name}</p>}
      {update.available && <p className="personal-intro">Dostupná verzia {update.available.name}</p>}
      <button
        type="button"
        className="personal-action mt-3"
        disabled={update.busy}
        onClick={() => void (update.available || update.platform === "legacy" ? update.install() : update.checkNow())}
      >
        {update.platform === "legacy" ? "Stiahnuť aktualizáciu" : update.available ? "Aktualizovať" : "Skontrolovať aktualizácie"}
      </button>
      <p className="personal-intro" role="status">{update.message}</p>
    </section>
  );
}

const VERSION_KEY = "antidote:seen-build";

export function UpdateNotice() {
  const [notice, setNotice] = useState<"available" | "installed" | null>(null);
  const android = useAndroidRelease(true);
  const [dismissedAndroidVersion, setDismissedAndroidVersion] = useState<number>();
  const androidRelease = android.available?.code !== dismissedAndroidVersion ? android.available : null;

  useEffect(() => {
    let active = true;

    try {
      const previous = localStorage.getItem(VERSION_KEY);
      localStorage.setItem(VERSION_KEY, __ANTIDOTE_BUILD_ID__);
      if (previous && previous !== __ANTIDOTE_BUILD_ID__) setNotice("installed");
    } catch {
      // The update check still works when storage is unavailable.
    }

    async function checkVersion() {
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active && typeof data.version === "string" && data.version !== __ANTIDOTE_BUILD_ID__) {
          setNotice("available");
        }
      } catch {
        // A temporary connection failure does not interrupt the app.
      }
    }

    function checkWhenVisible() {
      if (document.visibilityState === "visible") void checkVersion();
    }

    void checkVersion();
    const interval = window.setInterval(checkWhenVisible, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  if (androidRelease && notice !== "available") {
    return (
      <div className="update-notice" role="status">
        <RefreshCw size={18} aria-hidden="true" />
        <span>{android.message || `Android verzia ${androidRelease.name} je dostupná.`}</span>
        <button type="button" onClick={() => void android.install()} disabled={android.busy}>Aktualizovať</button>
        <button type="button" className="update-notice-close" onClick={() => setDismissedAndroidVersion(androidRelease.code)} aria-label="Zavrieť oznámenie">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!notice) return null;

  return (
    <div className="update-notice" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <span>{notice === "available" ? "K dispozícii je nová verzia." : "Aplikácia bola aktualizovaná."}</span>
      {notice === "available" && (
        <button type="button" onClick={() => window.location.reload()}>Obnoviť</button>
      )}
      <button type="button" className="update-notice-close" onClick={() => setNotice(null)} aria-label="Zavrieť oznámenie">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
