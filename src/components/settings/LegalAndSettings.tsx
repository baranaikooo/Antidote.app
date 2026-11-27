import React from "react";
import { ArrowLeft } from "lucide-react";

export function LegalPage({
  title,
  onBack,
  body,
}: {
  title: string;
  onBack: () => void;
  body: Array<{ h: string; p: string[] }>;
}) {
  return (
    <div className="personal-screen">
      <header className="personal-header">
        <button onClick={onBack} className="personal-action mb-2 inline-flex items-center gap-2">
          <ArrowLeft className="size-4" aria-hidden="true" /> Nastavenia
        </button>
        <h1 className="personal-title">{title}</h1>
        <p className="personal-intro">Posledná aktualizácia: jún 2026</p>
      </header>

      <div>
        {body.map((s, i) => (
          <section key={i} className="personal-section">
            <h2 className="personal-heading mb-3">{s.h}</h2>
            <div className="space-y-3">
              {s.p.map((line, j) => (
                <p key={j} className="leading-relaxed text-muted-foreground">
                  {line.split(/([a-zA-Z0-9._%+-]+@antidote\.app)/g).map((part, idx) =>
                    part.endsWith("@antidote.app") ? (
                      <a
                        key={idx}
                        href={`mailto:${part}`}
                        className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
                      >
                        {part}
                      </a>
                    ) : (
                      part
                    ),
                  )}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Toto je informatívne zhrnutie pravidiel. V prípade nejasností nás kontaktuj cez sekciu{" "}
        <span className="text-foreground">Kontakt</span>.
      </p>
    </div>
  );
}

export const TERMS_BODY: Array<{ h: string; p: string[] }> = [
  {
    h: "1. O službe",
    p: [
      "Antidote je aplikácia na zoznamovanie založené na psychologickej rezonancii. Namiesto swipovania ťa páruje cez krátky test a hlasovú konverzáciu.",
      "Používaním aplikácie potvrdzuješ, že máš aspoň 16 rokov a že údaje o sebe poskytuješ pravdivo.",
    ],
  },
  {
    h: "2. Tvoje povinnosti",
    p: [
      "Zaväzuješ sa nepoužívať aplikáciu na obťažovanie, spam, podvody, propagáciu nenávisti či komerčné účely.",
      "Tvoje overenie tváre slúži výhradne na potvrdenie, že si reálny človek. Vydávanie sa za iného je dôvodom na okamžité ukončenie účtu.",
    ],
  },
  {
    h: "3. Obsah a komunikácia",
    p: [
      "Hlasovky aj textové správy zdieľaš s druhým účastníkom rozhovoru. Ukončený rozhovor už účastníci v aplikácii neotvoria.",
      "Zakazuje sa zdieľať obsah, ktorý je nezákonný, urážlivý, sexuálne explicitný bez súhlasu druhej strany alebo porušuje práva tretích osôb.",
    ],
  },
  {
    h: "4. Ukončenie účtu",
    p: [
      "Účet môžeš kedykoľvek zrušiť v sekcii Nastavenia. Po zrušení sú tvoje dáta odstránené v zákonných lehotách.",
      "Vyhradzujeme si právo ukončiť účet, ktorý porušuje tieto podmienky, bez nároku na náhradu.",
    ],
  },
  {
    h: "5. Zodpovednosť",
    p: [
      'Aplikácia je poskytovaná „tak, ako je". Snažíme sa o jej spoľahlivosť, ale nezodpovedáme za rozhodnutia, ktoré urobíš na základe interakcií s inými používateľmi.',
      "Za bezpečnosť pri osobných stretnutiach mimo aplikácie nesieš plnú zodpovednosť ty.",
    ],
  },
  {
    h: "6. Zmeny podmienok",
    p: [
      "Tieto podmienky môžeme aktualizovať. O podstatných zmenách ťa upozorníme v aplikácii a budeš mať možnosť ich prijať alebo účet zrušiť.",
    ],
  },
];

export const PRIVACY_BODY: Array<{ h: string; p: string[] }> = [
  {
    h: "1. Kto sme",
    p: [
      "Prevádzkovateľom služby Antidote je tím vývojárov so sídlom v Slovenskej republike. V zmysle Nariadenia (EÚ) 2016/679 (GDPR) sme prevádzkovateľom tvojich osobných údajov.",
    ],
  },
  {
    h: "2. Aké údaje spracúvame",
    p: [
      "Identifikačné: telefónne číslo, krstné meno alebo prezývka, vek, mesto, pohlavie, orientácia.",
      "Overovacie: krátky 3-sekundový videoklip tváre slúžiaci na potvrdenie, že si reálny človek.",
      "Spracúvame odpovede z dotazníka, výsledky párovania a obsah rozhovorov vrátane odpovedí na spoločné otázky na začiatku rozhovoru. Odpoveď na spoločnú otázku sa druhému účastníkovi sprístupní, keď odpovie aj on.",
    ],
  },
  {
    h: "3. Účely spracúvania",
    p: [
      "Poskytovanie služby — párovanie, komunikácia, bezpečnosť účtu.",
      "Zlepšovanie kvality (v agregovanej, anonymizovanej forme).",
      "Plnenie zákonných povinností.",
    ],
  },
  {
    h: "4. Doba uchovania",
    p: [
      "Profilové údaje: po dobu existencie účtu.",
      "Overovacie video: maximálne 30 dní, alebo do úspešného overenia.",
      "Správy, vybrané GIFy a odpovede na spoločné otázky ukladáme v Supabase. GIFy sa načítajú zo služby GIPHY alebo KLIPY. Pri živom vyhľadávaní posielame do KLIPY hľadaný výraz a pseudonymný identifikátor. Ukončenie rozhovoru zruší prístup účastníkov cez aplikáciu. Odpoveď na spoločnú otázku môžeš stiahnuť pred jej sprístupnením druhému účastníkovi.",
    ],
  },
  {
    h: "5. Tvoje práva (GDPR)",
    p: [
      "Právo na prístup, opravu, výmaz, obmedzenie spracúvania, prenosnosť a námietku.",
      "Právo podať sťažnosť na Úrade na ochranu osobných údajov SR.",
      "Žiadosti adresuj cez sekciu Kontakt — odpovieme do 30 dní.",
    ],
  },
  {
    h: "6. Bezpečnosť",
    p: [
      "Údaje sú šifrované pri prenose (TLS) aj v pokoji. K osobným údajom má prístup len obmedzený okruh autorizovaných osôb.",
    ],
  },
];

export const COOKIES_BODY: Array<{ h: string; p: string[] }> = [
  {
    h: "Aké cookies používame",
    p: [
      "Nevyhnutné: udržiavajú tvoje prihlásenie a preferenciu vzhľadu (tmavý/svetlý režim). Bez nich aplikácia nefunguje.",
      "Funkčné: zapamätajú si jazyk a nastavenia.",
      "Nepoužívame reklamné ani trackingové cookies tretích strán.",
    ],
  },
  {
    h: "Lokálne úložisko",
    p: [
      "Lokálne úložisko používame na nastavenia aplikácie a obnovenie rozpracovanej registrácie.",
      "Údaje môžeš kedykoľvek zmazať v Nastaveniach.",
    ],
  },
];

export const CONTACT_BODY: Array<{ h: string; p: string[] }> = [
  {
    h: "Napíš nám",
    p: [
      "Pre otázky, sťažnosti a uplatnenie GDPR práv: hello@antidote.app",
      "Odpovedáme v pracovných dňoch zvyčajne do 48 hodín.",
    ],
  },
  {
    h: "Bezpečnostné incidenty",
    p: ["Ak narazíš na bezpečnostnú chybu, prosím nahlás ju na: security@antidote.app"],
  },
];
