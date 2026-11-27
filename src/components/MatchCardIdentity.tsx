import { ResonanceAvatar } from "./ResonanceAvatar";

export function MatchCardIdentity({
  name,
  age,
  city,
  distanceKm,
  orbSeed,
  heading: Heading = "h2",
}: {
  name: string;
  age: number;
  city?: string | null;
  distanceKm?: number;
  orbSeed?: string;
  heading?: "h2" | "h3";
}) {
  const details = [
    age > 0 ? `${age} rokov` : null,
    city,
    distanceKm === undefined ? null : `${Math.round(distanceKm)} km`,
  ].filter(Boolean);

  return (
    <header className="match-card-header">
      <div className="flex items-end gap-3">
        <ResonanceAvatar name={name} seed={orbSeed || name} className="size-12 text-lg" />
        <div className="min-w-0">
          <Heading className="match-card-name">{name}</Heading>
          {details.length > 0 && <p className="match-card-location">{details.join(" · ")}</p>}
        </div>
      </div>
    </header>
  );
}
