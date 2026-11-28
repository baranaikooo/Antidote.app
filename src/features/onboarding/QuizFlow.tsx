import { lazy, Suspense, useEffect } from "react";
import { ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Archetype, orbSeedFor } from "@/lib/resonance";

const LazyNebulaOrb = lazy(() =>
  import("@/components/NebulaOrb").then((m) => ({ default: m.NebulaOrb })),
);

export function Briefing({ onBegin }: { onBegin: () => void }) {
  return (
    <main className="onboarding-panel mx-auto max-w-md animate-fade-up">
      <h1 className="mb-2 max-w-sm font-display text-[clamp(2.35rem,10vw,3.5rem)] font-extrabold leading-none tracking-[-0.04em]">
        Poďme sa trochu spoznať.
      </h1>
      <p className="text-sm font-medium text-coral">Približne 2 minúty</p>
      <div className="mt-6 pt-4 text-muted-foreground">
        <p className="max-w-sm text-base leading-relaxed">
          Prvé otázky sa týkajú toho, ako sa rozhoduješ vo vzťahoch.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Žiadne správne odpovede — iba to, čo je ti blízke.
        </p>
      </div>
      <button
        type="button"
        onClick={onBegin}
        className="match-card-action mt-6"
      >
        <span>Začať</span>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </main>
  );
}

export function Processing({
  seed,
  archetype,
  onDone,
}: {
  seed: ReturnType<typeof orbSeedFor>;
  archetype: Archetype;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="onboarding-panel mx-auto max-w-md text-center animate-fade-up">
      <p className="editorial-kicker text-accent">Tvoj profil je hotový</p>
      <h2 className="mt-2 font-display text-[clamp(2rem,8vw,2.85rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
        {archetype.label}
      </h2>
      <div className="my-6 grid place-items-center">
        <Suspense fallback={<Skeleton className="size-[168px] rounded-full" />}>
          <LazyNebulaOrb seed={seed} size={168} />
        </Suspense>
      </div>
      <div className="mx-auto flex max-w-44 gap-1.5" aria-label="Pripravujem tvoje spojenia">
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className="h-1.5 flex-1 animate-pulse rounded-full bg-accent"
            style={{ animationDelay: `${step * 140}ms` }}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Hľadáme spojenia podľa tvojich odpovedí.
      </p>
      <button type="button" onClick={onDone} className="priority-primary mt-5">
        Pokračovať do Spojení
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
