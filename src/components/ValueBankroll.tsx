import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

interface ValueBankrollProps {
  onDone: (conscientiousness: number, priorities: Record<string, number>) => void;
  onSliderChange?: (conscientiousness: number, extraversion: number) => void;
}

const CATEGORIES = [
  { id: "rodina", label: "Rodina", desc: "Blízkosť, zázemie a ľudia, na ktorých sa dá spoľahnúť." },
  { id: "kariera", label: "Kariéra", desc: "Rast, ambície a práca, ktorá má význam." },
  { id: "stabilita", label: "Stabilita", desc: "Istota, plán a pokoj v každodennom živote." },
  { id: "kreativita", label: "Tvorivosť", desc: "Zvedavosť, nápady a chuť vytvárať niečo nové." },
  { id: "sloboda", label: "Sloboda", desc: "Nezávislosť, dobrodružstvo a priestor meniť smer." },
] as const;

const TOTAL_TOKENS = 10;
const TOKEN_VALUE = 10;
const MAX_TOKENS_PER_CATEGORY = 5;

export function ValueBankroll({ onDone, onSliderChange }: ValueBankrollProps) {
  const haptic = useHaptic();
  const [tokens, setTokens] = useState<Record<string, number>>({
    rodina: 0,
    kariera: 0,
    stabilita: 0,
    kreativita: 0,
    sloboda: 0,
  });

  const allocatedTokens = Object.values(tokens).reduce((sum, value) => sum + value, 0);
  const remainingTokens = TOTAL_TOKENS - allocatedTokens;

  const toPercentages = (values: Record<string, number>) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value * TOKEN_VALUE]));

  const getDerivedMetrics = (values: Record<string, number>) => {
    const allocations = toPercentages(values);
    const rodina = allocations.rodina || 0;
    const career = allocations.kariera || 0;
    const stability = allocations.stabilita || 0;
    const kreativita = allocations.kreativita || 0;
    const freedom = allocations.sloboda || 0;

    const conscientiousness = (career + stability + (20 - freedom / 5)) / 220;
    const clampedC = Math.max(0.1, Math.min(0.99, conscientiousness));
    const extraversion =
      (0.8 * freedom + 0.6 * rodina + 0.5 * career + 0.4 * kreativita + 0.2 * stability) / 100;

    return { c: clampedC, e: Math.max(0.1, Math.min(0.99, extraversion)) };
  };

  const updateCategory = (id: string, delta: 1 | -1) => {
    const current = tokens[id] || 0;
    if (delta === 1 && (remainingTokens === 0 || current >= MAX_TOKENS_PER_CATEGORY)) return;
    if (delta === -1 && current === 0) return;

    haptic(delta === 1 ? "tap" : "warning");
    setTokens((previous) => {
      const next = { ...previous, [id]: previous[id] + delta };
      const { c, e } = getDerivedMetrics(next);
      onSliderChange?.(c, e);
      return next;
    });
  };

  const handleConfirm = () => {
    if (remainingTokens !== 0) return;
    haptic("success");
    const { c } = getDerivedMetrics(tokens);
    onDone(c, toPercentages(tokens));
  };

  return (
    <div className="mx-auto w-full max-w-md px-1 pb-6 animate-fade-up">
      <header className="border-b border-foreground/30 pb-5">
        <p className="editorial-kicker text-cerebral">Hodnoty a priority · 02</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.04em]">
          Na čom ti záleží, keď sa musíš rozhodnúť?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Máš desať žetónov. Rozdeľ ich medzi veci, ktoré chceš chrániť aj v náročnom období.
        </p>
      </header>

      <section className="my-6 border-y border-foreground/25 py-5" aria-live="polite">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="mt-1 font-display text-xl font-bold">
              {remainingTokens === 0 ? "Všetky sú rozdelené" : `Zostáva ${remainingTokens} z 10`}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">1 žetón = 10 bodov</span>
        </div>
        <div className="grid grid-cols-10 gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_TOKENS }).map((_, index) => (
            <span
              key={index}
              className={`aspect-square rounded-full border-2 transition-all duration-200 ${
                index < remainingTokens
                  ? "border-foreground bg-cerebral"
                  : "scale-75 border-foreground/15 bg-transparent"
              }`}
            />
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {CATEGORIES.map((category, categoryIndex) => {
          const value = tokens[category.id] || 0;
          const canAdd = remainingTokens > 0 && value < MAX_TOKENS_PER_CATEGORY;

          return (
            <section
              key={category.id}
              className={`overflow-hidden rounded-[0.875rem] border transition-colors ${
                value > 0 ? "border-foreground bg-card" : "border-foreground/20 bg-transparent"
              }`}
            >
              <button
                type="button"
                onClick={() => updateCategory(category.id, 1)}
                disabled={!canAdd}
                className="flex w-full items-start gap-4 p-4 text-left disabled:cursor-default"
                aria-label={`Pridať žetón: ${category.label}`}
              >
                <span className="text-xs text-muted-foreground">
                  {String(categoryIndex + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xl font-bold tracking-[-0.035em]">
                    {category.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {category.desc}
                  </span>
                </span>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full border ${
                    canAdd
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/15 text-foreground/20"
                  }`}
                >
                  <Plus className="size-4" />
                </span>
              </button>

              <div className="flex items-center gap-3 border-t border-foreground/15 px-4 py-3">
                <div className="grid flex-1 grid-cols-5 gap-2">
                  {Array.from({ length: MAX_TOKENS_PER_CATEGORY }).map((_, index) => {
                    const allocated = index < value;
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => allocated && updateCategory(category.id, -1)}
                        disabled={!allocated}
                        className={`aspect-square rounded-full border-2 transition-all ${
                          allocated
                            ? "border-foreground bg-cerebral active:scale-95"
                            : "border-dashed border-foreground/15"
                        }`}
                        aria-label={
                          allocated
                            ? `Odobrať žetón z ${category.label}`
                            : `Prázdne miesto v ${category.label}`
                        }
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => updateCategory(category.id, -1)}
                  disabled={value === 0}
                  className="grid size-9 shrink-0 place-items-center border border-foreground/20 text-muted-foreground disabled:opacity-20"
                  aria-label={`Odobrať žetón: ${category.label}`}
                >
                  <Minus className="size-4" />
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        disabled={remainingTokens !== 0}
        onClick={handleConfirm}
        className="tactile-button mt-6 flex w-full items-center justify-between bg-foreground px-5 py-4 text-background disabled:pointer-events-none disabled:opacity-25"
      >
        <span className="font-display text-base font-bold">
          {remainingTokens === 0 ? "Toto sú moje priority" : `Rozdeľ ešte ${remainingTokens}`}
        </span>
        {remainingTokens === 0 ? (
          <Check className="size-5" />
        ) : (
          <span className="text-sm tabular-nums">{remainingTokens}/10</span>
        )}
      </button>
    </div>
  );
}
