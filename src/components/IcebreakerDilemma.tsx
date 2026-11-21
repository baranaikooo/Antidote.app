import { MessageCircle } from "lucide-react";

interface IcebreakerDilemmaProps {
  similarity: number;
  complementarity: number;
  userStyle: string;
  matchStyle: string;
  userTopPriority: string;
  matchTopPriority: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  rodina: "Rodina",
  kariera: "Kariéra",
  stabilita: "Stabilita",
  kreativita: "Kreativita",
  sloboda: "Sloboda",
};

export function IcebreakerDilemma({
  similarity,
  complementarity,
  userStyle,
  matchStyle,
  userTopPriority,
  matchTopPriority,
}: IcebreakerDilemmaProps) {
  // Generate dilemma content based on vectors
  let dilemmaTitle = "Otázka na prvú reakciu";
  let dilemmaText = "";
  let reason = "";

  if (userTopPriority === matchTopPriority && userTopPriority) {
    dilemmaTitle = "Spoločná hodnota";
    reason = `Oboja zdieľate rovnakú životnú prioritu: ${CATEGORY_NAMES[userTopPriority] || userTopPriority}.`;

    if (userTopPriority === "rodina") {
      dilemmaText =
        "Predstavte si, že máte možnosť odísť na rok na izolovanú chatu v lese úplne bez signálu, kde budete mať len jeden druhého. Prijali by ste to, alebo je pre vás rodinné zázemie spojené s blízkosťou širšieho okolia?";
    } else if (userTopPriority === "kariera") {
      dilemmaText =
        "Oboch vás poháňa úspech. Ak by jeden z vás dostal životnú ponuku v zahraničí, ktorá by však znamenala, že druhý musí svoju kariéru na 2 roky odložiť, ako by ste to vyriešili?";
    } else if (userTopPriority === "stabilita") {
      dilemmaText =
        "Zhodli ste sa na potrebe istoty. Čo by vás viac vyviedlo z rovnováhy: nečakaná výpoveď z bytu s nutnosťou rýchleho sťahovania, alebo zistenie, že váš partner urobil veľké spontánne finančné rozhodnutie?";
    } else if (userTopPriority === "kreativita") {
      dilemmaText =
        "Umenie a objavovanie sú vaše jadro. Ak by ste mali spoločne vytvoriť jedno dielo (obraz, pieseň alebo knihu), o čom by bolo a kto z vás by priniesol chaos a kto štruktúru?";
    } else {
      dilemmaText =
        "Sloboda je pre vás všetkým. Znamená pre vás sloboda vo vzťahu možnosť tráviť veľa času osamote bez vysvetľovania, alebo spoločné bezhraničné dobrodružstvá?";
    }
  } else if (complementarity > 0.75) {
    dilemmaTitle = "Rozdiel, ktorý stojí za rozhovor";
    reason = "Každý z vás čerpá energiu iným spôsobom.";
    dilemmaText =
      "Jeden z vás miluje nabíjanie batérií osamote, druhý čerpá energiu zo sociálneho ruchu. Ak by ste mali naplánovať ideálny víkend, kde by v sobotu večer bol veľký večierok a v nedeľu ticho v prírode, prežili by ste to v harmónii?";
  } else {
    dilemmaTitle = "Podobný spôsob uvažovania";
    reason = `Vaša kognitívna zhoda je vysoká (${Math.round(similarity * 100)}%).`;
    dilemmaText =
      "Dostali ste možnosť zistiť presný dátum a okolnosti konca vášho vzťahu s vedomím, že to nemôžete zmeniť. Chceli by ste to vedieť, aby ste si viac vážili spoločný čas, alebo by to pre vás bolo prekliatím?";
  }

  return (
    <div className="border border-foreground/25 bg-card p-5 relative overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="font-display text-lg font-bold tracking-[-0.035em] text-foreground">
          {dilemmaTitle}
        </h4>
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-foreground/20">
          <MessageCircle className="size-4" />
        </span>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-foreground/50">
        Prečo práve táto otázka: {reason}
      </p>

      <div className="border-y border-foreground/20 py-5 mb-5">
        <p className="font-display text-xl font-semibold leading-snug tracking-[-0.025em] text-foreground">
          {dilemmaText}
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-foreground/45">
        <div className="flex -space-x-1">
          <div className="size-6 rounded-full border border-foreground bg-foreground text-xs flex items-center justify-center text-background font-bold">
            {userStyle[0]}
          </div>
          <div className="size-6 rounded-full border border-foreground bg-accent text-xs flex items-center justify-center text-accent-foreground font-bold">
            {matchStyle[0]}
          </div>
        </div>
        <span>Obaja odpovedáte bez toho, aby ste najprv počuli druhého.</span>
      </div>
    </div>
  );
}
