import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

interface ValueBankrollProps {
  onDone: (conscientiousness: number, priorities: Record<string, number>) => void;
  onSliderChange?: (conscientiousness: number, extraversion: number) => void;
}

export const PRIORITY_CATEGORIES = [
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
    const next = { ...tokens, [id]: current + delta };
    setTokens(next);
    const { c, e } = getDerivedMetrics(next);
    onSliderChange?.(c, e);
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

      <p className="priority-balance font-semibold tabular-nums" role="status">
        {remainingTokens > 0 ? `Zostáva ${remainingTokens} z ${TOTAL_TOKENS}` : "Všetky žetóny sú rozdelené"}
      </p>

      <ul className="space-y-2">
        {PRIORITY_CATEGORIES.map(({ id, label, desc }) => {
          const value = tokens[id];
          return (
            <li key={id} className="priority-row" data-allocated={value > 0}>
              <div className="min-w-0">
                <h3 className="font-bold">{label}</h3>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{desc}</p>
              </div>
              <div className="priority-stepper" role="group" aria-label={label}>
                <button type="button" onClick={() => updateCategory(id, -1)} disabled={value === 0} aria-label={`Odobrať žetón: ${label}`}>
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="tabular-nums">{value}<span className="sr-only"> pridelených žetónov</span></span>
                <button type="button" onClick={() => updateCategory(id, 1)} disabled={remainingTokens === 0 || value >= MAX_TOKENS_PER_CATEGORY} aria-label={`Pridať žetón: ${label}`}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={remainingTokens !== 0}
        onClick={handleConfirm}
        className="tactile-button mt-5 flex min-h-12 w-full items-center justify-between bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-40"
      >
        Toto sú moje priority
        <Check size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
