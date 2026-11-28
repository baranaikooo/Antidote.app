import { useState } from "react";
import { Check, Compass, Heart } from "lucide-react";

import { AntidoteLogo } from "@/components/AntidoteLogo";
import { GoogleSignInButton, type GoogleProfile } from "@/components/GoogleSignInButton";
import { useHaptic } from "@/hooks/use-haptics";

export function Landing({ onGoogle }: { onGoogle: (profile: GoogleProfile) => void }) {
  const haptic = useHaptic();
  const [choice, setChoice] = useState<"travel" | "love" | null>(null);
  const [showReturningLogin, setShowReturningLogin] = useState(false);
  const options = [
    { value: "travel", label: "Možnosť cestovať", icon: Compass },
    { value: "love", label: "Možnosť zamilovať sa", icon: Heart },
  ] as const;

  const choose = (nextChoice: "travel" | "love") => {
    haptic("medium");
    setChoice(nextChoice);
    setShowReturningLogin(false);
  };

  return (
    <main className="landing-main">
      <div className="landing-hero">
        <header className="landing-intro">
          <div className="landing-brand">
            <AntidoteLogo markClassName="h-8" />
          </div>
          <p>Zoznamka, ktorá začína otázkou</p>
        </header>
        <h1 className="landing-title">Čo by si radšej stratil/a na jeden rok?</h1>
        <p className="landing-subcopy">
          Najprv sa spoznáte hlasom, až potom odhalíte tvár.
        </p>
      </div>
      <div className="landing-interaction" data-answered={choice !== null || showReturningLogin}>
        <div className="landing-options" role="group" aria-label="Vyber si odpoveď">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={choice === value}
              data-option={value}
              className="landing-option"
            >
              <span className="landing-option-icon" aria-hidden="true">
                <Icon size={21} />
              </span>
              <span>{label}</span>
              <span className="landing-option-state" aria-hidden="true">
                {choice === value && <Check size={19} />}
              </span>
            </button>
          ))}
        </div>
        <div role="status" className="sr-only">
          {choice && "Odpoveď vybraná. Môžeš pokračovať cez Google."}
        </div>
        {choice ? (
          <div className="landing-result">
            <p>Podľa odpovedí v dotazníku ti odporučíme ľudí.</p>
            <div className="landing-sign-in">
              <GoogleSignInButton onSuccess={onGoogle} />
            </div>
          </div>
        ) : (
          <div className="landing-returning">
            {showReturningLogin ? (
              <div className="landing-result">
                <p>Prihlás sa k svojmu profilu.</p>
                <div className="landing-sign-in">
                  <GoogleSignInButton onSuccess={onGoogle} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="landing-returning-toggle"
                onClick={() => {
                  haptic("tap");
                  setShowReturningLogin(true);
                }}
              >
                Už mám účet · Prihlásiť sa
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
