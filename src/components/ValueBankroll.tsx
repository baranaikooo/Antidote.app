import { useCallback, useRef, useState, type MouseEvent } from "react";
import { Check, Minus, Plus } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

import { PRIORITY_CATEGORIES } from "@/lib/priority-categories";

export { PRIORITY_CATEGORIES };

interface ValueBankrollProps {
  userId?: string | null;
  onDone: (conscientiousness: number, priorities: Record<string, number>) => void;
  onSliderChange?: (conscientiousness: number, extraversion: number) => void;
}

const TOTAL_TOKENS = 10;
const TOKEN_VALUE = 10;
const MAX_TOKENS_PER_CATEGORY = 5;
const EMPTY_ALLOCATION = {
  rodina: 0,
  kariera: 0,
  stabilita: 0,
  kreativita: 0,
  sloboda: 0,
};

type PriorityDraft = { tokens: Record<string, number>; reviewing: boolean };
const EMPTY_DRAFT: PriorityDraft = { tokens: EMPTY_ALLOCATION, reviewing: false };

function readDraft(storageKey: string | undefined): PriorityDraft {
  if (!storageKey || typeof window === "undefined") return EMPTY_DRAFT;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY_DRAFT;

    const saved = JSON.parse(raw);
    const tokens = { ...EMPTY_ALLOCATION };
    let total = 0;
    for (const { id } of PRIORITY_CATEGORIES) {
      const value = saved?.tokens?.[id];
      if (!Number.isInteger(value) || value < 0 || value > MAX_TOKENS_PER_CATEGORY) {
        return EMPTY_DRAFT;
      }
      tokens[id] = value;
      total += value;
    }
    if (total > TOTAL_TOKENS) return EMPTY_DRAFT;

    return { tokens, reviewing: total === TOTAL_TOKENS && saved.reviewing === true };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(storageKey: string | undefined, draft: PriorityDraft | null) {
  if (!storageKey) return;
  try {
    if (draft) window.localStorage.setItem(storageKey, JSON.stringify(draft));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Token allocation remains usable if browser storage is unavailable.
  }
}

function animateToken(from: HTMLElement, to: HTMLElement) {
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const x = end.left + end.width / 2 - (start.left + start.width / 2);
  const y = end.top + end.height / 2 - (start.top + start.height / 2);
  const coin = document.createElement("span");
  coin.className = "priority-flying-token";
  coin.setAttribute("aria-hidden", "true");
  coin.style.left = start.left + start.width / 2 + "px";
  coin.style.top = start.top + start.height / 2 + "px";
  coin.style.background = getComputedStyle(from).getPropertyValue("--accent");
  document.body.append(coin);
  const easing = getComputedStyle(from).getPropertyValue("--app-ease").trim();
  const flight = coin.animate(
    [
      { transform: "scale(0.75)", opacity: 0.75 },
      { transform: "translate(" + x + "px, " + y + "px) scale(1.15)", opacity: 1, offset: 0.82 },
      { transform: "translate(" + x + "px, " + y + "px) scale(0.75)", opacity: 0 },
    ],
    { duration: 240, easing: easing || "ease-out" },
  );
  void flight.finished.then(
    () => coin.remove(),
    () => coin.remove(),
  );
}

export function ValueBankroll({ userId, ...props }: ValueBankrollProps) {
  const storageKey = userId ? `reson:priority-draft:${userId}` : undefined;
  return <PriorityAllocation key={storageKey} storageKey={storageKey} {...props} />;
}

function PriorityAllocation({
  storageKey,
  onDone,
  onSliderChange,
}: Omit<ValueBankrollProps, "userId"> & { storageKey?: string }) {
  const haptic = useHaptic();
  const [{ tokens, reviewing }, setDraft] = useState(() => readDraft(storageKey));
  const title = useRef<HTMLHeadingElement>(null);
  const reserve = useRef<HTMLElement>(null);
  const focusSummary = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);

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

  const updateDraft = (next: Record<string, number>, reviewing: boolean) => {
    const draft = { tokens: next, reviewing };
    setDraft(draft);
    writeDraft(storageKey, Object.values(next).some(Boolean) ? draft : null);
  };

  const updateAllocation = (next: Record<string, number>) => {
    updateDraft(next, false);
    const { c, e } = getDerivedMetrics(next);
    onSliderChange?.(c, e);
  };

  const updateCategory = (id: string, delta: 1 | -1, event: MouseEvent<HTMLButtonElement>) => {
    const current = tokens[id];
    if (delta === 1 && (remainingTokens === 0 || current >= MAX_TOKENS_PER_CATEGORY)) return;
    if (delta === -1 && current === 0) return;

    haptic("tap");
    updateAllocation({ ...tokens, [id]: current + delta });

    if (
      event.detail === 0 ||
      !HTMLElement.prototype.animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    )
      return;
    const supply = reserve.current;
    const count = event.currentTarget.parentElement?.querySelector<HTMLElement>(".priority-count");
    if (supply && count) {
      if (delta === 1) animateToken(supply, count);
      else animateToken(count, supply);
    }
  };

  const editAllocation = () => {
    updateDraft(tokens, false);
    title.current?.focus();
  };

  const resetAllocation = () => {
    updateAllocation(EMPTY_ALLOCATION);
    title.current?.focus();
  };

  const handleConfirm = () => {
    if (remainingTokens !== 0) return;
    haptic("success");
    const { c } = getDerivedMetrics(tokens);
    onDone(c, toPercentages(tokens));
    writeDraft(storageKey, null);
  };

  return (
    <section className="priority-screen mx-auto w-full max-w-md" aria-labelledby="priority-title">
      <header className="mb-4">
        <h2
          id="priority-title"
          ref={title}
          tabIndex={-1}
          className="font-display text-[clamp(2rem,8.5vw,2.75rem)] font-extrabold leading-none tracking-[-0.04em]"
        >
          Na čom ti záleží?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Podľa tvojich priorít hľadáme spoločné hodnoty. Rozdeľ 10 žetónov, najviac 5 na jednu
          hodnotu.
        </p>
      </header>

      {!reviewing && (
        <>
          <div className="priority-balance">
            <div className="priority-reserve">
              <p
                className="flex items-center justify-between gap-2 text-sm font-semibold"
                role="status"
                aria-atomic="true"
              >
                Žetóny na rozdelenie
                <strong ref={reserve} className="priority-remaining tabular-nums text-accent">
                  {remainingTokens} z {TOTAL_TOKENS}
                </strong>
              </p>
              <div className="priority-meter" aria-hidden="true">
                {Array.from({ length: TOTAL_TOKENS }, (_, index) => (
                  <span key={index} data-remaining={index < remainingTokens} />
                ))}
              </div>
            </div>
          </div>

          <ul>
            {PRIORITY_CATEGORIES.map(({ id, label, desc }) => {
              const value = tokens[id];
              return (
                <li key={id} className="priority-row" data-allocated={value > 0}>
                  <div className="min-w-0">
                    <h3 className="font-bold">{label}</h3>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{desc}</p>
                  </div>
                  <div className="priority-stepper" role="group" aria-label={label}>
                    <button
                      type="button"
                      onClick={(event) => updateCategory(id, -1, event)}
                      disabled={value === 0}
                      aria-label={`Odobrať žetón: ${label}`}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <span className="priority-count">
                      {value}
                      <span className="sr-only"> pridelených žetónov</span>
                    </span>
                    <button
                      type="button"
                      onClick={(event) => updateCategory(id, 1, event)}
                      disabled={remainingTokens === 0 || value >= MAX_TOKENS_PER_CATEGORY}
                      aria-label={`Pridať žetón: ${label}`}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            disabled={remainingTokens !== 0}
            onClick={() => updateDraft(tokens, true)}
            className="priority-primary"
          >
            Pokračovať
          </button>
        </>
      )}

      {reviewing && (
        <>
          <section className="priority-reserve" aria-labelledby="priority-summary-title">
            <h3
              ref={focusSummary}
              id="priority-summary-title"
              tabIndex={-1}
              className="text-xl font-bold"
            >
              Tvoje priority
            </h3>
            <ul className="mt-2 divide-y divide-foreground/10">
              {PRIORITY_CATEGORIES.filter(({ id }) => tokens[id] > 0).map(({ id, label }) => (
                <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                  {label}
                  <strong className="tabular-nums">
                    {tokens[id]} z {TOTAL_TOKENS}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
          <button type="button" onClick={handleConfirm} className="priority-primary">
            Pokračovať na ďalšiu otázku
            <Check size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={editAllocation} className="priority-secondary">
            Upraviť rozdelenie
          </button>
        </>
      )}
      {allocatedTokens > 0 && (
        <button type="button" onClick={resetAllocation} className="priority-secondary">
          Začať odznova
        </button>
      )}
    </section>
  );
}
