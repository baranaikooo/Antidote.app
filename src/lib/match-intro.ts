import type { ConversationPartner } from "@/lib/conversations";
import { PRIORITY_CATEGORIES } from "@/lib/priority-categories";
import type { RankedMatch } from "@/lib/resonance";

export function toConversationPartner(match: RankedMatch): ConversationPartner {
  return {
    id: match.id,
    name: match.name,
    age: match.age,
    city: match.city,
    top_priority: match.top_priority,
    shared_reflection: match.shared_reflection ?? null,
  };
}

const PRIORITY_QUESTIONS: Record<string, string> = {
  rodina: "Ako vyzerá blízkosť v tvojom bežnom týždni?",
  kariera: "Kedy sa ti podarilo nájsť čas na niekoho, aj keď ťa práca naplno zamestnávala?",
  stabilita: "Ktorá drobná vec ti vo vzťahu dáva pocit istoty?",
  kreativita: "Čo by si raz chcel/a spolu s niekým vytvoriť?",
  sloboda: "Kedy si sa vo vzťahu cítil/a slobodne a zároveň blízko?",
};

function sharedPriority(myPriority: string | undefined, partnerPriority: string | null) {
  return myPriority === partnerPriority
    ? PRIORITY_CATEGORIES.find((category) => category.id === myPriority)
    : undefined;
}

export function introductionFor(myPriority: string | undefined, partner: ConversationPartner) {
  const shared = sharedPriority(myPriority, partner.top_priority);
  const text =
    partner.shared_reflection?.trim() ||
    (shared
      ? PRIORITY_QUESTIONS[shared.id]
      : "Ktorú vec o sebe človek pochopí až po dobrom rozhovore s tebou?");
  return { shared, text };
}
