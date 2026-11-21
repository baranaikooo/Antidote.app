import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";

import {
  androidUpdatePlatform,
  downloadAndroidUpdater,
  installedAndroidVersion,
  installAndroidUpdate,
  latestAndroidVersion,
  type AndroidVersion,
  type AndroidUpdateProgress as UpdateProgress,
} from "@/lib/android-updates";

function useAndroidRelease(enabled: boolean) {
  const [platform, setPlatform] = useState<ReturnType<typeof androidUpdatePlatform>>(null);
  const [installed, setInstalled] = useState<AndroidVersion | null>(null);
  const [available, setAvailable] = useState<AndroidVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !platform || (platform === "native" && !installed)) return;
    let active = true;
    let checking = false;
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const version = await latestAndroidVersion();
        if (active) {
          setAvailable(version && (platform === "legacy" || version.code > (installed?.code ?? 0)) ? version : null);
        }
      } catch {
        // Keep the last known release during temporary network failures.
      } finally {
        checking = false;
      }
    }
    void check();
    const interval = window.setInterval(check, 15_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [enabled, installed, platform]);

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
    setMessage("");
    setProgress({ stage: "preparing" });
    try {
      if (platform === "legacy") {
        await downloadAndroidUpdater();
        setMessage("Po stiahnutí otvor APK a potvrď aktualizáciu. Ďalšie verzie nainštaluješ priamo tu.");
      } else if (available) {
        const { state } = await installAndroidUpdate(available, setProgress);
        setMessage(state === "permission"
          ? "Povoľ inštaláciu z Antidote a po návrate spusti stiahnutie znova."
          : "Potvrď aktualizáciu v okne Androidu.");
      }
    } catch {
      setMessage("Aktualizáciu sa nepodarilo pripraviť. Skús to znova.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return { platform, installed, available, busy, message, progress, checkNow, install };
}

const AndroidUpdateContext = createContext<ReturnType<typeof useAndroidRelease> | null>(null);

export function AndroidUpdateProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const update = useAndroidRelease(enabled);
  return <AndroidUpdateContext.Provider value={update}>{children}</AndroidUpdateContext.Provider>;
}

function AndroidProgress({ progress }: { progress: UpdateProgress }) {
  const { stage, received = 0, total = 0 } = progress;
  const fraction = stage === "downloading" && total > 0 ? Math.min(1, Math.max(0, received / total)) : null;
  const percentage = fraction === null ? undefined : Math.floor(fraction * 100);
  const label = {
    preparing: "Pripravujem aktualizáciu…",
    permission: "Povoľ inštaláciu v Androide",
    downloading: "Sťahujem APK…",
    verifying: "Overujem APK…",
  }[stage];

  return (
    <div className="update-progress">
      <div className="update-progress-label">
        <span role="status">{label}</span>
        {percentage !== undefined && <span aria-hidden="true">{percentage} %</span>}
      </div>
      <div className="update-progress-track" role="progressbar" aria-label={label}
        aria-valuenow={percentage} data-indeterminate={fraction === null}>
        <span style={{ transform: `scaleX(${fraction ?? 1})` }} />
      </div>
    </div>
  );
}

export function AndroidUpdateSettings() {
  const update = useContext(AndroidUpdateContext);
  if (!update?.platform) return null;
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
        {update.platform === "legacy" || update.available ? "Stiahnuť aktualizáciu" : "Skontrolovať aktualizácie"}
      </button>
      {update.progress && <AndroidProgress progress={update.progress} />}
      {update.message && <p className="personal-intro" role="status">{update.message}</p>}
    </section>
  );
}

const VERSION_KEY = "antidote:seen-build";

export function UpdateNotice() {
  const [notice, setNotice] = useState<"available" | "installed" | null>(null);
  const android = useContext(AndroidUpdateContext);
  const [dismissedAndroidVersion, setDismissedAndroidVersion] = useState<number>();
  const androidRelease = android?.available?.code !== dismissedAndroidVersion ? android?.available : null;

  useEffect(() => {
    if (androidUpdatePlatform()) return;
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

  if (android && androidRelease) {
    return (
      <div className="update-notice">
        <RefreshCw size={18} aria-hidden="true" />
        {android.progress ? <AndroidProgress progress={android.progress} /> :
          <span role="status">{android.message || `Android verzia ${androidRelease.name} je dostupná.`}</span>}
        <button type="button" onClick={() => void android.install()} disabled={android.busy}>Stiahnuť</button>
        <button type="button" className="update-notice-close" onClick={() => setDismissedAndroidVersion(androidRelease.code)} disabled={android.busy} aria-label="Zavrieť oznámenie">
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
