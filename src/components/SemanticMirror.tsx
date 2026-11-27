import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";
import {
  readSituationScores,
  scaleSituationWeight,
  type SituationScores,
} from "@/lib/situation-scores";

interface SemanticMirrorProps {
  onDone: (cognitiveDepth: number, situationScores: SituationScores) => void;
}

// The order defines the positions in profiles.situation_scores.
const prompts = [
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
];

export function SemanticMirror({ onDone }: SemanticMirrorProps) {
  const haptic = useHaptic();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleSelect = (idx: number) => {
    haptic("tap");
    setSelectedIdx(idx);
  };

  const handleNext = () => {
    if (selectedIdx === null) return;

    haptic("medium");
    const weight = prompts[step].options[selectedIdx].weight;
    const newAnswers = [...answers, weight];
    setAnswers(newAnswers);

    if (step < prompts.length - 1) {
      setStep(step + 1);
      setSelectedIdx(null);
    } else {
      const avgDepth = newAnswers.reduce((a, b) => a + b, 0) / prompts.length;
      const scores = readSituationScores(
        newAnswers.map((answer, index) =>
          scaleSituationWeight(
            answer,
            prompts[index].options.map(({ weight }) => weight),
          ),
        ),
      );
      if (scores) onDone(avgDepth, scores);
    }
  };

  const current = prompts[step];

  return (
    <div className="mx-auto w-full max-w-md px-1 pb-6 animate-fade-up">
      <div className="mb-5">
        <p className="text-sm text-muted-foreground" role="status">
          Otázka {step + 1} z {prompts.length}
        </p>
        <progress
          className="question-progress"
          aria-label="Postup v dotazníku"
          value={step + 1}
          max={prompts.length}
        />
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
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full border border-current text-sm"
                aria-hidden="true"
              >
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
