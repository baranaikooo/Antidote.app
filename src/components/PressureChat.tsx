import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

interface PressureChatProps {
  onDone: (
    attachmentStyle: string,
    responseTime: number,
    hesitated: boolean,
    scenarioId: string,
  ) => void;
  isOnboarding?: boolean;
  excludeScenarioIds?: string[];
}

export const SCENARIOS = [
  {
    id: "scenario_01_ghosting",
    sender: "Partner",
    context: "Popoludní v pracovný deň",
    message: "Prečo mi neodpisuješ celé poobede? Deje sa niečo?",
    options: [
      { text: "Som ponorený/á do práce, mobil mám bokom. Ozvem sa večer.", style: "Avoidant" },
      {
        text: "Prepáč, nechcel/a som, aby to vyznelo chladne. Hneď ako skončím, volám.",
        style: "Anxious",
      },
      { text: "Nič sa nedeje, len mám dnes plnú hlavu. Večer som tvoj/a.", style: "Secure" },
    ],
  },
  {
    id: "scenario_02_cancellation",
    sender: "Partner",
    context: "Hodinu pred stretnutím",
    message: "Prepáč, dnes to nedávam. Som úplne vyčerpaný/á, musím to zrušiť.",
    options: [
      { text: "V poriadku, aspoň si spravím vlastný večer.", style: "Avoidant" },
      { text: "Mrzí ma to. Nechceš, aby som sa aspoň na chvíľu zastavil/a?", style: "Anxious" },
      { text: "Úplne chápem, oddýchni si. Presunieme to na iný deň.", style: "Secure" },
    ],
  },
  {
    id: "scenario_03_jealousy",
    sender: "Partner",
    context: "Večerná správa",
    message: "Kamoši hovorili, že ťa dnes videli v meste s niekým na káve.",
    options: [
      { text: "Bolo to pracovné. Nevidím dôvod hlásiť každú kávu.", style: "Avoidant" },
      { text: "Poďme si zavolať, nechcem, aby si o tom musel/a premýšľať.", style: "Anxious" },
      {
        text: "Hej, stretol/a som známeho. Pokojne ti poviem viac, nič za tým nie je.",
        style: "Secure",
      },
    ],
  },
  {
    id: "scenario_04_control",
    sender: "Partner",
    context: "Spoločný víkend",
    message: "Kto ti dnes toľko píše? Dúfam, že predo mnou nič neskrývaš.",
    options: [
      { text: "Svoj telefón si nechávam pre seba. Nemám pred tebou tajnosti.", style: "Avoidant" },
      { text: "Pozri sa pokojne so mnou, nech máš istotu, že sa nič nedeje.", style: "Anxious" },
      { text: "Riešim len pár vecí z práce. Odložím mobil, nech máme pokoj.", style: "Secure" },
    ],
  },
  {
    id: "scenario_05_distance",
    sender: "Partner",
    context: "Po náročnom týždni",
    message: "Mám pocit, že si posledné dni nejaký/á vzdialený/á. Je medzi nami všetko ok?",
    options: [
      { text: "Je, len teraz potrebujem trochu ticha a priestoru pre seba.", style: "Avoidant" },
      {
        text: "Určite áno — mrzí ma, ak som pôsobil/a odťažito. Stretnime sa dnes.",
        style: "Anxious",
      },
      {
        text: "Áno, len na mňa doľahol ťažký týždeň. Rád/a sa o tom porozprávam.",
        style: "Secure",
      },
    ],
  },
];

export function PressureChat({
  onDone,
  isOnboarding = false,
  excludeScenarioIds = [],
}: PressureChatProps) {
  const haptic = useHaptic();
  const startTimeRef = useRef<number>(0);
  const gyroSamples = useRef<{ time: number; beta: number; gamma: number }[]>([]);
  const lastTickRef = useRef<number>(0);

  const [scenario] = useState(() => {
    const pool =
      excludeScenarioIds && excludeScenarioIds.length > 0
        ? SCENARIOS.filter((s) => !excludeScenarioIds.includes(s.id))
        : SCENARIOS;
    const finalPool = pool.length > 0 ? pool : SCENARIOS;
    const idx = Math.floor(Math.random() * finalPool.length);
    return finalPool[idx];
  });

  const wordCount = scenario.message.split(/\s+/).length;
  const calculatedLimit = isOnboarding ? 14.0 : Math.max(wordCount / (200 / 60) + 6.0, 9.0);

  const uiSpeed =
    typeof window !== "undefined"
      ? window.localStorage.getItem("reson_ui_speed") || "TYPEWRITER_ANIMATED"
      : "TYPEWRITER_ANIMATED";
  const isInstant = uiSpeed === "INSTANT_RAW";

  const [totalLimit] = useState(calculatedLimit);
  const [timeLeft, setTimeLeft] = useState(calculatedLimit);
  const [isTyping, setIsTyping] = useState(!isInstant);
  const [clicked, setClicked] = useState(false);
  const [showIntro, setShowIntro] = useState(isOnboarding);

  useEffect(() => {
    if (!showIntro) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        haptic("tap");
        setShowIntro(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showIntro, haptic]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      gyroSamples.current.push({
        time: performance.now(),
        beta: e.beta,
        gamma: e.gamma,
      });
      const now = performance.now();
      gyroSamples.current = gyroSamples.current.filter((s) => now - s.time < 3000);
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  useEffect(() => {
    if (showIntro) return;
    if (isInstant) {
      setIsTyping(false);
      startTimeRef.current = performance.now();
      lastTickRef.current = performance.now();
      return;
    }
    const typingTimer = setTimeout(() => {
      setIsTyping(false);
      haptic("tap");
      startTimeRef.current = performance.now();
      lastTickRef.current = performance.now();
    }, 1800);

    return () => clearTimeout(typingTimer);
  }, [haptic, isInstant, showIntro]);

  const checkGyroscopeVolatility = (): boolean => {
    try {
      const now = performance.now();
      const recent = gyroSamples.current.filter(
        (s) =>
          s && typeof s.beta === "number" && typeof s.gamma === "number" && now - s.time < 2000,
      );
      if (recent.length < 5) return false;

      const betas = recent.map((s) => s.beta);
      const gammas = recent.map((s) => s.gamma);

      const meanBeta = betas.reduce((a, b) => a + b, 0) / betas.length;
      const meanGamma = gammas.reduce((a, b) => a + b, 0) / gammas.length;

      const varBeta = betas.reduce((a, b) => a + Math.pow(b - meanBeta, 2), 0) / betas.length;
      const varGamma = gammas.reduce((a, b) => a + Math.pow(b - meanGamma, 2), 0) / gammas.length;

      return varBeta > 12.0 || varGamma > 12.0;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (showIntro || isTyping || clicked) return;

    const start = performance.now();
    const initialLimit = timeLeft;

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;
      const newTime = initialLimit - elapsed;

      if (newTime <= 0) {
        clearInterval(interval);
        setClicked(true);
        haptic("warning");
        const isHesitated = checkGyroscopeVolatility();
        onDone("Avoidant", totalLimit, isHesitated, scenario.id);
        setTimeLeft(0);
      } else {
        setTimeLeft(newTime);
        if (newTime < 3.5 && now - lastTickRef.current >= 900) {
          haptic("tick");
          lastTickRef.current = now;
        }
      }
    }, 60);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIntro, isTyping, clicked]);

  const handleSelect = (style: string) => {
    if (clicked || isTyping) return;
    setClicked(true);
    haptic("medium");

    const rt = (performance.now() - startTimeRef.current) / 1000.0;
    const isHesitated = checkGyroscopeVolatility();
    onDone(style, rt, isHesitated, scenario.id);
  };

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / totalLimit) * 100));
  const isClosingSoon = !isTyping && timeLeft < 3.5;

  if (showIntro) {
    return (
      <div className="onboarding-panel mx-auto w-full max-w-md animate-fade-up">
        <p className="editorial-kicker text-cerebral">Spontánna reakcia · 03</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.04em] text-foreground">
          Ako odpovieš na správu?
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-foreground/65">
          Prečítaš si správu z bežnej situácie vo vzťahu. Vyber odpoveď, ktorú by si poslal/a ako prvú. Žiadna nie je správna ani nesprávna.
        </p>

        <div className="my-7 border-y border-foreground/25 py-4 text-xs text-muted-foreground">
          Prvý dotyk odošle odpoveď. Na prečítanie a výber máš približne 14 sekúnd.
        </div>

        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setShowIntro(false);
          }}
          className="tactile-button flex w-full items-center justify-between bg-foreground px-5 py-4 text-background cursor-pointer"
        >
          <span className="font-display text-base font-bold">Zobraziť správu</span>
          <ArrowRight className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-1 pb-6 animate-fade-up">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <p className="editorial-kicker text-cerebral">Spontánna reakcia · 03</p>
          <p className="mt-1 text-xs text-muted-foreground">{scenario.context}</p>
        </div>
        <span
          className={`text-xs tabular-nums ${
            isClosingSoon ? "font-semibold text-cerebral" : "text-muted-foreground"
          }`}
        >
          {isTyping ? "prichádza správa…" : `${Math.ceil(timeLeft)} s`}
        </span>
      </header>

      <div className="mb-6 h-1 w-full overflow-hidden bg-foreground/10">
        <div
          className={`h-full transition-all duration-100 ${
            isTyping ? "bg-foreground/30" : isClosingSoon ? "bg-cerebral" : "bg-accent"
          }`}
          style={{ width: `${isTyping ? 100 : progressPercent}%` }}
        />
      </div>

      <div className="editorial-panel mb-6 p-5">
        <div className="mb-4 flex items-center justify-between border-b border-foreground/15 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
              <MessageCircle className="size-4" />
            </span>
            <div>
              <p className="font-display text-sm font-bold leading-none">{scenario.sender}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isTyping ? "píše správu…" : "práve teraz"}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-24 flex items-center">
          {isTyping ? (
            <div className="inline-flex items-center gap-1.5 border border-foreground/15 bg-foreground/[0.04] px-4 py-3">
              <span
                className="size-1.5 rounded-full bg-foreground/45 motion-safe:animate-pulse"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="size-1.5 rounded-full bg-foreground/45 motion-safe:animate-pulse"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="size-1.5 rounded-full bg-foreground/45 motion-safe:animate-pulse"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          ) : (
            <div className="animate-fade-up">
              <p className="font-display text-xl font-semibold leading-snug tracking-[-0.025em] text-foreground">
                “{scenario.message}”
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {isTyping ? "Počkaj na správu…" : "Ťuknutím odošleš vybranú odpoveď."}
      </p>

      <div className="space-y-2.5">
        {scenario.options.map((opt, idx) => (
          <button
            key={idx}
            type="button"
            disabled={clicked || isTyping}
            onClick={() => handleSelect(opt.style)}
            className="tactile-button w-full bg-card px-4 py-4 text-left text-sm font-medium leading-relaxed text-foreground transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-35 cursor-pointer"
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
}
