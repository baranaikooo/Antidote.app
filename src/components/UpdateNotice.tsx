import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

const VERSION_KEY = "antidote:seen-build";

export function UpdateNotice() {
  const [notice, setNotice] = useState<"available" | "installed" | null>(null);

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
