import { Compass, MapPin, ShieldCheck } from "lucide-react";

import { AntidoteLogo } from "@/components/AntidoteLogo";
import { useHaptic } from "@/hooks/use-haptics";

export type PermissionPrimerKind = "notifications" | "location";

type PreviewCard = {
  id: string;
  title: string;
  meta: string;
  body: string;
  icon?: typeof MapPin;
};

const NOTIFICATION_CARDS: PreviewCard[] = [
  {
    id: "voice",
    title: "Nová hlasová odpoveď",
    meta: "teraz",
    body: "Niekto odpovedal hlasom na spoločnú otázku.",
  },
  {
    id: "message",
    title: "Máš novú správu",
    meta: "pred 4 min",
    body: "Nadviazala na tvoju odpoveď v rozhovore.",
  },
  {
    id: "match",
    title: "Nové spojenie v okolí",
    meta: "pred hodinou",
    body: "Pribudol profil s podobnými hodnotami.",
  },
];

const LOCATION_CARDS: PreviewCard[] = [
  {
    id: "radius",
    title: "Ľudia v reálnom dosahu",
    meta: "teraz",
    body: "Zobrazíme len spojenia zo vzdialenosti, ktorú si zvolíš.",
    icon: MapPin,
  },
  {
    id: "city",
    title: "Mesto doplnené automaticky",
    meta: "automaticky",
    body: "Uložíme aktuálne mesto bez ručného zadávania.",
    icon: Compass,
  },
  {
    id: "privacy",
    title: "Presná adresa zostáva skrytá",
    meta: "súkromie",
    body: "Druhá strana vidí len mesto a orientačné kilometre.",
    icon: ShieldCheck,
  },
];

export function PermissionPrimer({
  kind,
  busy = false,
  onEnable,
  onDismiss,
}: {
  kind: PermissionPrimerKind;
  busy?: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  const haptic = useHaptic();
  const isNotifications = kind === "notifications";
  const cards = isNotifications ? NOTIFICATION_CARDS : LOCATION_CARDS;

  return (
    <section
      className="permission-primer"
      data-kind={kind}
      aria-labelledby="permission-primer-heading"
    >
      <header className="permission-primer-header">
        <h1 id="permission-primer-heading" className="permission-primer-title">
          {isNotifications ? (
            <>
              Jeden klik a neujde ti{" "}
              <span className="permission-primer-accent">odpoveď</span>
            </>
          ) : (
            <>
              Spojenia priamo{" "}
              <span className="permission-primer-accent">v tvojom okolí</span>
            </>
          )}
        </h1>
        <p className="permission-primer-copy">
          {isNotifications
            ? "Dáme ti vedieť hneď, keď ti niekto nahrá hlasovku alebo pošle novú správu."
            : "Doplníme mesto do profilu a ukážeme ľudí v dosahu, ktorý si vyberieš."}
        </p>
      </header>

      <div className="permission-primer-stage" aria-hidden="true">
        <div className="permission-primer-phone">
          <div className="permission-primer-island" />
          <div className="permission-primer-screen">
            <div className="permission-primer-appbar">
              <AntidoteLogo markClassName="h-5" />
              <span className="permission-primer-chip">
                {isNotifications ? "Správy" : "Do 25 km · Bratislava"}
              </span>
            </div>

            {isNotifications ? (
              <div className="permission-primer-preview-card">
                <p className="permission-primer-preview-label">Spoločná otázka</p>
                <p className="permission-primer-preview-title">
                  Čo by si radšej stratil/a na jeden rok?
                </p>
                <div className="permission-primer-preview-bars">
                  <span />
                  <span />
                </div>
              </div>
            ) : (
              <div className="permission-primer-preview-card">
                <p className="permission-primer-preview-label">Objavovanie</p>
                <p className="permission-primer-preview-title">Nina, 27 · 4 km</p>
                <div className="permission-primer-preview-pills">
                  <span>Rodina</span>
                  <span>Kreativita</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="permission-primer-stack">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="permission-primer-toast"
                data-depth={index}
              >
                <div className="permission-primer-badge">
                  {Icon ? (
                    <Icon className="size-4" aria-hidden="true" />
                  ) : (
                    <AntidoteLogo markClassName="h-4" showWordmark={false} />
                  )}
                </div>
                <div className="permission-primer-toast-copy">
                  <div className="permission-primer-toast-top">
                    <span>{card.title}</span>
                    <time>{card.meta}</time>
                  </div>
                  <p>{card.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <footer className="permission-primer-dock">
        <button
          type="button"
          className="permission-primer-primary"
          disabled={busy}
          onClick={() => {
            haptic("medium");
            onEnable();
          }}
        >
          {busy
            ? "Čakám na potvrdenie…"
            : isNotifications
              ? "Zapnúť upozornenia"
              : "Povoliť polohu"}
        </button>
        <button
          type="button"
          className="permission-primer-secondary"
          disabled={busy}
          onClick={() => {
            haptic("tap");
            onDismiss();
          }}
        >
          Možno nabudúce
        </button>
      </footer>
    </section>
  );
}
