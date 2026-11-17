import { ArrowRight, X } from "lucide-react";

import { useHaptic } from "@/hooks/use-haptics";

interface BlindVoteProps {
  onVote: (vote: "unlock" | "cancel") => void;
  matchName?: string;
}

export function BlindVote({ onVote, matchName }: BlindVoteProps) {
  const haptic = useHaptic();

  const handleVote = (vote: "unlock" | "cancel") => {
    haptic(vote === "unlock" ? "success" : "warning");
    onVote(vote);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
      <div className="night-radio w-full max-w-md border-2 border-foreground p-6 sm:p-7 shadow-[6px_6px_0_rgba(244,239,229,0.9)]">
        <p className="editorial-kicker text-cerebral">Tri kolá sú za vami</p>
        <h3 className="mt-3 font-display text-3xl font-extrabold leading-[0.98] tracking-[-0.05em] text-foreground">
          {matchName ? `Chcete sa s ${matchName} spoznať ďalej?` : "Chcete sa spoznať ďalej?"}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-foreground/65">
          Každý z vás sa teraz rozhodne samostatne, bez toho aby videl voľbu druhého.
        </p>

        <div className="my-6 space-y-3 border-y border-foreground/20 py-5 text-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-cerebral font-mono text-xs font-bold text-background">
              1
            </span>
            <p className="leading-relaxed text-foreground/80">
              Ak sa pre pokračovanie rozhodnete{" "}
              <strong className="font-semibold text-foreground">obaja</strong>, odomkne sa čisté
              video aj otvorená konverzácia.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-foreground/30 font-mono text-xs text-foreground/65">
              2
            </span>
            <p className="leading-relaxed text-foreground/65">
              Ak sa čo i len jeden rozhodne skončiť, rozhovor sa pokojne uzavrie a nezostane po ňom
              história.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleVote("unlock")}
            className="tactile-button flex w-full items-center justify-between bg-cerebral px-5 py-4 text-background cursor-pointer"
          >
            <span className="font-display text-base font-bold">Chcem pokračovať</span>
            <ArrowRight className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => handleVote("cancel")}
            className="flex w-full items-center justify-between border border-foreground/25 bg-transparent px-5 py-3.5 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/50 hover:text-foreground cursor-pointer"
          >
            <span>Ukončiť rozhovor</span>
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
