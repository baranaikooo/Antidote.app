const ORB_PALETTES = [
  ["#82A2FF", "#3159D6", "#172131"],
  ["#9BB5FF", "#4E6EE6", "#1D2A44"],
  ["#7AD6C4", "#2E7D8C", "#132934"],
  ["#C6B4FF", "#6951C8", "#201B3B"],
  ["#F0B98C", "#B85C43", "#2E1C1A"],
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
