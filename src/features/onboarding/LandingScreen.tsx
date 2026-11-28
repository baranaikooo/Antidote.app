import { useState } from "react";
import { AudioLines, Check, ChevronDown, Compass, Heart } from "lucide-react";

import { AntidoteLogo } from "@/components/AntidoteLogo";
import { GoogleSignInButton, type GoogleProfile } from "@/components/GoogleSignInButton";
import { useHaptic } from "@/hooks/use-haptics";

const sampleQuestion = "Čo by si radšej stratil/a na jeden rok?";

export function Landing({
  mobile = false,
  onGoogle,
}: {
  mobile?: boolean;
  onGoogle: (profile: GoogleProfile) => void;
}) {
  const haptic = useHaptic();
  const [choice, setChoice] = useState<"travel" | "love" | null>(null);
  const [showSample, setShowSample] = useState(false);
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

  const questionOptions = (
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
  );

  if (mobile) {
    return (
      <main className="mobile-welcome">
        <header className="mobile-welcome-brand">
          <AntidoteLogo markClassName="h-7" />
        </header>
        <div className="mobile-welcome-intro">
          <div className="mobile-welcome-mark" aria-hidden="true">
            <AudioLines size={44} strokeWidth={1.75} />
          </div>
          <h1>Zoznamka, ktorá začína otázkou</h1>
          <p>Najprv sa spoznáte hlasom. Profilové videá uvidíte, až keď s tým obaja súhlasíte.</p>
        </div>
        <div className="mobile-welcome-actions">
          <GoogleSignInButton onSuccess={onGoogle} />
          <button
            type="button"
            className="mobile-welcome-sample"
            aria-expanded={showSample}
            aria-controls="welcome-sample"
            onClick={() => {
              haptic("tap");
              setShowSample((open) => !open);
            }}
          >
            {showSample ? "Skryť otázku" : "Vyskúšať otázku"}
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <section id="welcome-sample" hidden={!showSample} className="mobile-welcome-question">
            <h2>{sampleQuestion}</h2>
            {questionOptions}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="landing-main">
      <div className="landing-hero">
        <header className="landing-intro">
          <div className="landing-brand">
            <AntidoteLogo markClassName="h-8" />
          </div>
          <p>Zoznamka, ktorá začína otázkou</p>
        </header>
        <h1 className="landing-title">{sampleQuestion}</h1>
        <p className="landing-subcopy">
          Najprv sa spoznáte hlasom, až potom odhalíte tvár.
        </p>
      </div>
      <div className="landing-interaction" data-answered={choice !== null || showReturningLogin}>
        {questionOptions}
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
