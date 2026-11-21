import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

interface SemanticMirrorProps {
  onDone: (cognitiveDepth: number) => void;
}

const PROMPTS_POOL = [
  {
    text: "Dobré ticho medzi dvoma ľuďmi znamená, že...",
    options: [
      { text: "nikto z nás práve nemusí nič dokazovať ani zachraňovať konverzáciu.", weight: 1.0 },
      { text: "obaja sme unavení, ale je nám spolu príjemne v jednej miestnosti.", weight: 0.7 },
      {
        text: "radšej sa hneď opýtam, nad čím druhý premýšľa, nech nevznikne neistota.",
        weight: 0.4,
      },
    ],
  },
  {
    text: "Keď sa s niekým blízkym nezhodnem v dôležitej veci...",
    options: [
      { text: "najprv chcem pochopiť, ako k tomu dospel, aj keď s ním nesúhlasím.", weight: 1.0 },
      { text: "potrebujem chvíľu odstup, aby som nepovedal niečo z prvej emócie.", weight: 0.75 },
      {
        text: "radšej to rýchlo uzavriem kompromisom, nech medzi nami nezostane dusno.",
        weight: 0.4,
      },
    ],
  },
  {
    text: "Sloboda vo vzťahu pre mňa vyzerá tak, že...",
    options: [
      { text: "môžem sa meniť bez strachu, že ma druhý prestane spoznávať.", weight: 1.0 },
      {
        text: "máme každý aj vlastný svet, ku ktorému sa netreba neustále pýtať na povolenie.",
        weight: 0.75,
      },
      {
        text: "nič si zbytočne neplánujeme dopredu a nechávame veciam voľný priebeh.",
        weight: 0.4,
      },
    ],
  },
  {
    text: "Človeka spoznám najlepšie vtedy, keď...",
    options: [
      { text: "vidím, ako sa správa, keď mu niečo nevyjde podľa predstáv.", weight: 1.0 },
      {
        text: "sa spolu rozprávame neskoro večer bez toho, aby niekto pozeral na hodinky.",
        weight: 0.8,
      },
      { text: "zistím, aký má vkus, humor a tempo bežného dňa.", weight: 0.45 },
    ],
  },
  {
    text: "Pocit domova pri druhom človeku vzniká, keď...",
    options: [
      { text: "pred ním nemusím filtrovať ani to, v čom si práve nie som istý/á.", weight: 1.0 },
      { text: "viem, že sa na neho dá spoľahnúť aj v úplne obyčajný utorok.", weight: 0.75 },
      { text: "si rozumieme bez dlhého vysvetľovania a máme podobné zvyky.", weight: 0.45 },
    ],
  },
  {
    text: "Keď sa na sebe niečo snažím zmeniť...",
    options: [
      {
        text: "väčšinou to ide pomaly, ale všímam si, prečo sa vraciam k starým zvykom.",
        weight: 1.0,
      },
      { text: "pomôže mi, keď mám pri sebe niekoho, kto mi nastaví úprimné zrkadlo.", weight: 0.8 },
      { text: "najlepšie mi funguje rázny reštart a nové prostredie.", weight: 0.45 },
    ],
  },
];

export function SemanticMirror({ onDone }: SemanticMirrorProps) {
  const haptic = useHaptic();
  const [prompts, setPrompts] = useState<typeof PROMPTS_POOL>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    const shuffled = [...PROMPTS_POOL].sort(() => 0.5 - Math.random());
    setPrompts(shuffled.slice(0, 3));
  }, []);

  const handleSelect = (idx: number) => {
    haptic("tap");
    setSelectedIdx(idx);
  };

  const handleNext = () => {
    if (selectedIdx === null || prompts.length === 0) return;

    haptic("medium");
    const weight = prompts[step].options[selectedIdx].weight;
    const newAnswers = [...answers, weight];
    setAnswers(newAnswers);

    if (step < prompts.length - 1) {
      setStep(step + 1);
      setSelectedIdx(null);
    } else {
      const avgDepth = newAnswers.reduce((a, b) => a + b, 0) / prompts.length;
      onDone(avgDepth);
    }
  };

  if (prompts.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="size-7 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  const current = prompts[step];

  return (
    <div className="mx-auto w-full max-w-md px-1 pb-6 animate-fade-up">
      <header className="mb-6 flex items-end justify-between border-b border-foreground/25 pb-4">
        <div>
          <p className="editorial-kicker text-cerebral">Spôsob uvažovania · 01</p>
          <p className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">
            {String(step + 1).padStart(2, "0")}{" "}
            <span className="text-foreground/30">/ {String(prompts.length).padStart(2, "0")}</span>
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Vyber, čo ti je najbližšie</span>
      </header>

      <div className="mb-8 flex gap-1.5" aria-hidden>
        {prompts.map((_, idx) => (
          <span
            key={idx}
            className={`h-2 flex-1 transition-colors ${
              idx <= step ? "bg-cerebral" : "bg-foreground/10"
            }`}
          />
        ))}
      </div>

      <div className="onboarding-panel mb-5">
        <h1 className="font-display text-[clamp(1.75rem,7vw,2.5rem)] font-bold leading-[1.04] tracking-[-0.04em] text-foreground">
          {current.text}
        </h1>
      </div>

      <div className="space-y-3">
        {current.options.map((opt, idx) => {
          const isSelected = selectedIdx === idx;
          const letter = String.fromCharCode(65 + idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(idx)}
              aria-pressed={isSelected}
              className={`tactile-button flex min-h-16 w-full items-center justify-between gap-4 p-4 text-left cursor-pointer ${
                isSelected ? "bg-cerebral text-background" : "bg-card text-foreground"
              }`}
            >
              <span className="font-display text-lg font-bold leading-tight">{opt.text}</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-current text-sm" aria-hidden="true">
                {isSelected ? <Check size={16} /> : letter}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={selectedIdx === null}
        onClick={handleNext}
        className="tactile-button mt-6 flex w-full items-center justify-between bg-foreground px-5 py-4 text-background disabled:pointer-events-none disabled:opacity-25 cursor-pointer"
      >
        <span className="font-display text-base font-bold">
          {step === prompts.length - 1 ? "Pokračovať k prioritám" : "Ďalšia situácia"}
        </span>
        <ArrowRight className="size-5" />
      </button>
    </div>
  );
}
