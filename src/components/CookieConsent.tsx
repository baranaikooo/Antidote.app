import { useEffect, useState } from "react";
import { Cookie, Shield, BarChart3, Sparkles, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const KEY = "reson-cookie-consent-v1";

type Prefs = { necessary: true; analytics: boolean; personalization: boolean };

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    necessary: true,
    analytics: true,
    personalization: true,
  });

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function save(value: "accepted" | "rejected" | "custom", p?: Prefs) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          value,
          prefs:
            value === "accepted"
              ? { necessary: true, analytics: true, personalization: true }
              : value === "rejected"
                ? { necessary: true, analytics: false, personalization: false }
                : p,
          ts: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  const Row = ({
    icon: Icon,
    title,
    desc,
    checked,
    locked,
    onChange,
  }: {
    icon: typeof Shield;
    title: string;
    desc: string;
    checked: boolean;
    locked?: boolean;
    onChange?: (v: boolean) => void;
  }) => (
    <div className="flex items-start gap-3 border-t border-foreground/10 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <Switch
            checked={checked}
            disabled={locked}
            onCheckedChange={(v) => !locked && onChange?.(v)}
            aria-label={title}
          />
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="cookie-placement">
      <div className="editorial-dock cookie-dock max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <div className="flex items-start gap-3 p-3.5 sm:p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent">
            <Cookie className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold leading-tight">
              Nastavenia cookies
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">
              Analytiku a personalizáciu môžeš povoliť alebo odmietnuť.
            </p>
          </div>
        </div>

        {expanded && (
          <div className="px-3.5 sm:px-4">
            <Row
              icon={Shield}
              title="Nevyhnutné"
              desc="Bez týchto aplikácia nefunguje (prihlásenie, bezpečnosť)."
              checked
              locked
            />
            <Row
              icon={BarChart3}
              title="Analytika"
              desc="Anonymné dáta o používaní, aby sme vedeli, čo zlepšiť."
              checked={prefs.analytics}
              onChange={(v) => setPrefs({ ...prefs, analytics: v })}
            />
            <Row
              icon={Sparkles}
              title="Personalizácia"
              desc="Odporúčania spojení podľa tvojich odpovedí."
              checked={prefs.personalization}
              onChange={(v) => setPrefs({ ...prefs, personalization: v })}
            />
          </div>
        )}

        <div className="cookie-actions flex flex-wrap items-center justify-between gap-2 px-3.5 pb-3.5 sm:px-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Skryť detaily" : "Prispôsobiť"}
            <ChevronDown
              className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          <div className="cookie-decisions flex flex-wrap gap-2">
            <button
              onClick={() => (expanded ? save("custom", prefs) : save("rejected"))}
              className="cookie-choice personal-action rounded-full px-4 text-sm"
            >
              {expanded ? "Uložiť" : "Odmietnuť"}
            </button>
            <button
              onClick={() => save("accepted")}
              className="cookie-choice personal-action rounded-full px-4 text-sm"
            >
              <span className="relative z-10">Prijať všetko</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
