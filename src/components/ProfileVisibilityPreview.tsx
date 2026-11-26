import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchSharedProfileVideos } from "@/lib/conversations";
import type { UserProfile } from "@/lib/resonance";

export function ProfileVisibilityPreview({
  user,
}: {
  user: Pick<UserProfile, "id" | "name" | "age" | "city" | "sharedReflection" | "videoUrls">;
}) {
  const [showConsented, setShowConsented] = useState(false);
  const reflection = user.sharedReflection?.trim();

  return (
    <details className="personal-section settings-disclosure group">
      <summary className="personal-summary">
        <h2 className="personal-heading">Takto ťa uvidia ostatní</h2>
        <ChevronDown className="size-5 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-3 pt-3">
        <div className="personal-segments" role="group" aria-label="Viditeľnosť profilu">
          <button
            type="button"
            className="personal-segment"
            aria-pressed={!showConsented}
            onClick={() => setShowConsented(false)}
          >
            Karta v Spojeniach
          </button>
          <button
            type="button"
            className="personal-segment"
            aria-pressed={showConsented}
            onClick={() => setShowConsented(true)}
          >
            Po vzájomnom súhlase
          </button>
        </div>

        {showConsented ? (
          <section className="match-card" aria-label="Profilové videá v rozhovore">
            <p className="personal-status">
              Tvoje videá sa v rozhovore zobrazia, keď so zdieľaním súhlasíte obaja.
            </p>
            {user.id ? (
              <ConsentedVideos key={user.id} ownerId={user.id} savedVideos={user.videoUrls} />
            ) : (
              <p>Na profile zatiaľ nemáš žiadne videá.</p>
            )}
          </section>
        ) : (
          <article className="match-card" aria-label="Náhľad karty v Spojeniach">
            <header className="match-card-header">
              <div className="min-w-0">
                <h3 className="match-card-name">
                  {user.name} {user.age > 0 && <span>{user.age}</span>}
                </h3>
                {user.city && <p className="match-card-location">{user.city}</p>}
              </div>
              <div className="match-card-video" aria-hidden="true">
                {Array.from(user.name)[0]?.toLocaleUpperCase("sk")}
              </div>
            </header>
            {reflection && (
              <div className="match-shared-priority">
                <p className="text-sm font-medium text-muted-foreground">Zdieľaná odpoveď</p>
                <blockquote className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-lg font-semibold leading-snug">
                  {reflection}
                </blockquote>
              </div>
            )}
          </article>
        )}
      </div>
    </details>
  );
}

function ConsentedVideos({ ownerId, savedVideos }: { ownerId: string; savedVideos?: string[] }) {
  const [result, setResult] = useState<{ savedVideos?: string[]; videos: string[] | "error" }>();

  useEffect(() => {
    let active = true;
    void fetchSharedProfileVideos(ownerId).then(
      (videos) => {
        if (active) setResult({ savedVideos, videos });
      },
      () => {
        if (active) setResult({ savedVideos, videos: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [ownerId, savedVideos]);

  const videos = result?.savedVideos === savedVideos ? result?.videos : undefined;
  if (!videos) return <p role="status">Načítavam videá…</p>;
  if (videos === "error") return <p role="alert">Náhľad videí sa nepodarilo načítať.</p>;
  if (!videos.length) return <p>Na profile zatiaľ nemáš žiadne videá.</p>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {videos.map((url, index) => (
        <video
          key={url}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={`Profilové video ${index + 1}`}
          className="w-full rounded-lg bg-black"
        />
      ))}
    </div>
  );
}
