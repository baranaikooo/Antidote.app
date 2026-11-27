const ORB_PALETTES = [
  ["#FF7A66", "#EA3E23", "#2B1418"],
  ["#6B8FFF", "#2653F5", "#141D44"],
  ["#54EDB2", "#0EA96B", "#102E24"],
  ["#FFD766", "#E59800", "#38240B"],
  ["#E09EFF", "#8F3FE6", "#2A153E"],
] as const;

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function ResonanceAvatar({
  name,
  seed,
  unread = false,
  className = "size-12",
}: {
  name: string;
  seed: string;
  unread?: boolean;
  className?: string;
}) {
  const hash = hashSeed(seed || name);
  const [inner, mid, edge] = ORB_PALETTES[hash % ORB_PALETTES.length]!;
  const posX = 28 + (hash % 45);
  const posY = 24 + ((hash >> 4) % 44);
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("sk") ?? "?";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-bold text-[#F4EFE5] shadow-sm ${
        unread ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : "border border-white/15"
      } ${className}`}
      style={{
        background: `radial-gradient(circle at ${posX}% ${posY}%, ${inner} 0%, ${mid} 52%, ${edge} 100%)`,
      }}
      aria-hidden="true"
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{initial}</span>
    </span>
  );
}
