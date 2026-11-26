export function MatchCardIdentity({
  name,
  age,
  city,
  distanceKm,
  heading: Heading = "h2",
}: {
  name: string;
  age: number;
  city?: string | null;
  distanceKm?: number;
  heading?: "h2" | "h3";
}) {
  const details = [
    age > 0 ? `${age} rokov` : null,
    city,
    distanceKm === undefined ? null : `${Math.round(distanceKm)} km`,
  ].filter(Boolean);

  return (
    <header className="match-card-header">
      <Heading className="match-card-name">{name}</Heading>
      {details.length > 0 && <p className="match-card-location">{details.join(" · ")}</p>}
    </header>
  );
}
