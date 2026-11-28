import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Compact mobile safe-area banner shown only when the device loses network connectivity. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[55] mx-auto flex w-fit max-w-sm items-center gap-2 rounded-full border border-destructive/30 bg-card/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur-md animate-fade-up"
    >
      <WifiOff className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <span>Nie si pripojený k internetu</span>
    </div>
  );
}
